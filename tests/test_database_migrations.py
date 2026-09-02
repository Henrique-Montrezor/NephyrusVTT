"""Regressões das migrações leves executadas em bancos existentes."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy import create_engine, inspect, text

from backend.database import _migrate_token_catalog


class DatabaseMigrationTest(unittest.TestCase):
    def test_token_catalog_migration_preserves_existing_token(self) -> None:
        with TemporaryDirectory(prefix="nephyrus-migration-") as directory:
            legacy = create_engine(f"sqlite:///{Path(directory) / 'legacy.db'}")
            with legacy.begin() as connection:
                connection.execute(
                    text(
                        "CREATE TABLE scenes ("
                        "id INTEGER PRIMARY KEY, campaign_id VARCHAR NOT NULL)"
                    )
                )
                connection.execute(
                    text(
                        "CREATE TABLE campaign_members ("
                        "id VARCHAR PRIMARY KEY, campaign_id VARCHAR NOT NULL)"
                    )
                )
                connection.execute(
                    text(
                        """CREATE TABLE tokens (
                            id INTEGER PRIMARY KEY,
                            scene_id INTEGER NOT NULL,
                            name VARCHAR,
                            image_url VARCHAR,
                            x FLOAT,
                            y FLOAT,
                            size_squares FLOAT,
                            width FLOAT,
                            height FLOAT,
                            layer VARCHAR,
                            owner_id VARCHAR,
                            is_hidden BOOLEAN,
                            is_locked BOOLEAN,
                            light_radius FLOAT,
                            conditions VARCHAR
                        )"""
                    )
                )
                connection.execute(text("INSERT INTO scenes VALUES (7, 'camp-a')"))
                connection.execute(
                    text(
                        """INSERT INTO tokens VALUES (
                            11, 7, 'Ravi', '/storage/token.png', 32, 64, 1,
                            96, 80, 'object', 'p1', 0, 0, 0, ''
                        )"""
                    )
                )

                _migrate_token_catalog(connection)

            columns = {
                column["name"]: column
                for column in inspect(legacy).get_columns("tokens")
            }
            self.assertTrue(columns["scene_id"]["nullable"])
            self.assertIn("campaign_id", columns)
            self.assertIn("sheet_id", columns)

            with legacy.connect() as connection:
                row = connection.execute(
                    text(
                        "SELECT campaign_id, scene_id, sheet_id, width, height "
                        "FROM tokens WHERE id = 11"
                    )
                ).one()
            self.assertEqual(tuple(row), ("camp-a", 7, None, 96.0, 80.0))

            member_columns = {
                column["name"]
                for column in inspect(legacy).get_columns("campaign_members")
            }
            self.assertIn("current_scene_id", member_columns)

            # A segunda execução não reconstrói nem perde dados.
            with legacy.begin() as connection:
                _migrate_token_catalog(connection)
            with legacy.connect() as connection:
                count = connection.scalar(text("SELECT COUNT(*) FROM tokens"))
            self.assertEqual(count, 1)
            legacy.dispose()


if __name__ == "__main__":
    unittest.main()
