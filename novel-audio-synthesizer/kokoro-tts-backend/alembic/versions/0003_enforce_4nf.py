"""0003_enforce_4nf

Revision ID: 0003_enforce_4nf
Revises: 0002_enforce_strict_3nf
Create Date: 2026-10-14 14:20:00.000000

Decomposes relations to enforce Fourth Normal Form (4NF) across the entire schema:
1. Decomposes playback_history into:
   - playback_history (id PK, user_id FK, novel_id FK, created_at) with UNIQUE(user_id, novel_id)
   - playback_positions (history_id PK FK, chapter_id FK, segment_order, position_ms, updated_at)
   - Eliminates ambiguous duplicated updated_at semantics: updated_at belongs strictly to playback_positions
   - Enforces 1:0..1 optionality: parent bookmark persists independently, FK CASCADE cleans up position
   - Database-level cross-novel enforcement trigger via fn_check_playback_position_chapter_novel()
   - Proactive chapter-to-novel update guards via fn_check_playback_history_novel_update() and fn_check_chapter_novel_update()
   - Read-compatible projection view v_playback_history (LEFT JOIN) and reading_progress
2. Normalizes character_aliases by removing redundant novel_id:
   - character_aliases (id PK, character_id FK, alias, created_at) with UNIQUE(character_id, alias)
   - Concurrency-safe novel-level alias uniqueness trigger via fn_check_character_alias_novel_uniqueness() using pg_advisory_xact_lock
   - Guard against character novel reassignment collision via fn_check_character_novel_update()
   - Read-compatible projection view v_character_aliases
3. Drops redundant composite superkey constraints uq_chapters_novel_id_id and uq_characters_novel_id_id.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_enforce_4nf"
down_revision: Union[str, None] = "0002_enforce_strict_3nf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------------------
    # 1. Decompose playback_history -> playback_history + playback_positions
    # --------------------------------------------------------------------------
    # A. Create playback_positions table
    op.create_table(
        "playback_positions",
        sa.Column("history_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("segment_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("position_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["history_id"],
            ["playback_history.id"],
            ondelete="CASCADE",
            name="fk_playback_positions_history",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["chapters.id"],
            ondelete="CASCADE",
            name="fk_playback_positions_chapter",
        ),
        sa.PrimaryKeyConstraint("history_id", name="pk_playback_positions"),
    )
    op.create_index(
        op.f("ix_playback_positions_chapter_id"),
        "playback_positions",
        ["chapter_id"],
        unique=False,
    )

    # B. Migrate existing playback positions losslessly
    op.execute("""
        INSERT INTO playback_positions (history_id, chapter_id, segment_order, position_ms, updated_at)
        SELECT id, chapter_id, segment_order, position_ms, updated_at
        FROM playback_history;
    """)

    # Drop legacy reading_progress view before altering columns
    op.execute("DROP VIEW IF EXISTS reading_progress CASCADE;")

    # C. Drop composite FK and columns from playback_history
    # Eliminating updated_at from playback_history removes ambiguous duplicated semantics
    op.drop_constraint("fk_playback_history_novel_chapter", "playback_history", type_="foreignkey")
    op.drop_index(op.f("ix_playback_history_chapter_id"), table_name="playback_history")
    op.drop_column("playback_history", "chapter_id")
    op.drop_column("playback_history", "segment_order")
    op.drop_column("playback_history", "position_ms")
    op.drop_column("playback_history", "updated_at")
    op.add_column(
        "playback_history",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # D. Database-level trigger on playback_positions to verify chapter belongs to bookmark's novel
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_playback_position_chapter_novel()
        RETURNS TRIGGER AS $$
        DECLARE
          v_novel_id UUID;
          v_chapter_novel_id UUID;
          v_lock1 BIGINT;
          v_lock2 BIGINT;
        BEGIN
          -- 1. Acquire row-level locks FOR SHARE first, matching Postgres update order and eliminating lock inversion
          SELECT novel_id INTO v_novel_id FROM playback_history WHERE id = NEW.history_id FOR SHARE;
          IF v_novel_id IS NULL THEN
            RAISE EXCEPTION 'Referenced playback_history bookmark % does not exist', NEW.history_id;
          END IF;

          SELECT novel_id INTO v_chapter_novel_id FROM chapters WHERE id = NEW.chapter_id FOR SHARE;
          IF v_chapter_novel_id IS NULL THEN
            RAISE EXCEPTION 'Referenced chapter % does not exist', NEW.chapter_id;
          END IF;

          -- 2. Concurrency serialization: take advisory xact locks in deterministic sorted order second
          v_lock1 := hashtext('history_novel_sync_' || NEW.history_id::text);
          v_lock2 := hashtext('chapter_novel_sync_' || NEW.chapter_id::text);
          IF v_lock1 < v_lock2 THEN
            PERFORM pg_advisory_xact_lock(v_lock1);
            PERFORM pg_advisory_xact_lock(v_lock2);
          ELSIF v_lock1 > v_lock2 THEN
            PERFORM pg_advisory_xact_lock(v_lock2);
            PERFORM pg_advisory_xact_lock(v_lock1);
          ELSE
            PERFORM pg_advisory_xact_lock(v_lock1);
          END IF;

          -- 3. Verify chapter belongs to bookmark novel
          IF v_chapter_novel_id != v_novel_id THEN
            RAISE EXCEPTION 'Playback chapter mismatch: chapter % (novel %) does not belong to bookmark % (novel %)',
              NEW.chapter_id, v_chapter_novel_id, NEW.history_id, v_novel_id;
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_check_playback_position_chapter_novel
        BEFORE INSERT OR UPDATE OF chapter_id, history_id ON playback_positions
        FOR EACH ROW EXECUTE FUNCTION fn_check_playback_position_chapter_novel();
    """)

    # E. Chapter-to-novel update guards:
    # 1) When playback_history.novel_id is updated, verify child position chapter belongs to new novel
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_playback_history_novel_update()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.novel_id IS DISTINCT FROM OLD.novel_id THEN
            -- Concurrency serialization: take advisory xact lock on history_id
            PERFORM pg_advisory_xact_lock(hashtext('history_novel_sync_' || NEW.id::text));

            IF EXISTS (
              SELECT 1 FROM playback_positions p
              JOIN chapters c ON p.chapter_id = c.id
              WHERE p.history_id = NEW.id AND c.novel_id IS DISTINCT FROM NEW.novel_id
            ) THEN
              RAISE EXCEPTION 'Cannot update playback_history novel_id: existing playback_position chapter does not belong to novel %', NEW.novel_id;
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_check_playback_history_novel_update
        BEFORE UPDATE OF novel_id ON playback_history
        FOR EACH ROW EXECUTE FUNCTION fn_check_playback_history_novel_update();
    """)

    # 2) When chapters.novel_id is updated, verify no playback_positions references it under a different novel
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_chapter_novel_update()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.novel_id IS DISTINCT FROM OLD.novel_id THEN
            -- Concurrency serialization: take advisory xact lock on chapter_id
            PERFORM pg_advisory_xact_lock(hashtext('chapter_novel_sync_' || NEW.id::text));

            IF EXISTS (
              SELECT 1 FROM playback_positions p
              JOIN playback_history h ON p.history_id = h.id
              WHERE p.chapter_id = NEW.id AND h.novel_id IS DISTINCT FROM NEW.novel_id
            ) THEN
              RAISE EXCEPTION 'Cannot update chapters novel_id: chapter % is currently referenced by playback_positions in bookmark for novel %',
                NEW.id, OLD.novel_id;
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_check_chapter_novel_update
        BEFORE UPDATE OF novel_id ON chapters
        FOR EACH ROW EXECUTE FUNCTION fn_check_chapter_novel_update();
    """)

    # F. Read-compatible projection view v_playback_history (LEFT JOIN to support 1:0..1 optionality)
    op.execute("""
        CREATE OR REPLACE VIEW v_playback_history AS
        SELECT
          h.id,
          h.user_id,
          h.novel_id,
          p.chapter_id,
          p.segment_order,
          p.position_ms,
          p.updated_at
        FROM playback_history h
        LEFT JOIN playback_positions p ON h.id = p.history_id;

        CREATE OR REPLACE VIEW reading_progress AS
        SELECT
          id,
          user_id,
          novel_id,
          chapter_id,
          segment_order,
          position_ms,
          updated_at
        FROM v_playback_history;
    """)

    # --------------------------------------------------------------------------
    # 2. Decompose character_aliases: remove redundant novel_id
    # --------------------------------------------------------------------------
    op.drop_constraint("fk_character_aliases_novel_character", "character_aliases", type_="foreignkey")
    op.drop_constraint("uq_character_aliases_novel_alias", "character_aliases", type_="unique")
    op.drop_index(op.f("ix_character_aliases_novel_id"), table_name="character_aliases")
    op.drop_column("character_aliases", "novel_id")

    op.create_foreign_key(
        "fk_character_aliases_character",
        "character_aliases",
        "characters",
        ["character_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_character_aliases_character_alias",
        "character_aliases",
        ["character_id", "alias"],
    )

    # Concurrency-safe novel-level alias uniqueness trigger with advisory locking
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_character_alias_novel_uniqueness()
        RETURNS TRIGGER AS $$
        DECLARE
          v_novel_id UUID;
          v_old_novel_id UUID;
          v_lock1 BIGINT;
          v_lock2 BIGINT;
        BEGIN
          -- Concurrency serialization: lock referenced character row(s) FOR SHARE first
          IF TG_OP = 'UPDATE' AND OLD.character_id IS DISTINCT FROM NEW.character_id THEN
            IF OLD.character_id < NEW.character_id THEN
              SELECT novel_id INTO v_old_novel_id FROM characters WHERE id = OLD.character_id FOR SHARE;
              SELECT novel_id INTO v_novel_id FROM characters WHERE id = NEW.character_id FOR SHARE;
            ELSE
              SELECT novel_id INTO v_novel_id FROM characters WHERE id = NEW.character_id FOR SHARE;
              SELECT novel_id INTO v_old_novel_id FROM characters WHERE id = OLD.character_id FOR SHARE;
            END IF;

            IF v_novel_id IS NULL THEN
              RAISE EXCEPTION 'Referenced character % does not exist', NEW.character_id;
            END IF;

            -- Take advisory xact locks in deterministic integer sorted order
            IF v_old_novel_id IS NOT NULL AND v_old_novel_id IS DISTINCT FROM v_novel_id THEN
              v_lock1 := hashtext('char_alias_novel_' || v_old_novel_id::text);
              v_lock2 := hashtext('char_alias_novel_' || v_novel_id::text);
              IF v_lock1 < v_lock2 THEN
                PERFORM pg_advisory_xact_lock(v_lock1);
                PERFORM pg_advisory_xact_lock(v_lock2);
              ELSIF v_lock1 > v_lock2 THEN
                PERFORM pg_advisory_xact_lock(v_lock2);
                PERFORM pg_advisory_xact_lock(v_lock1);
              ELSE
                PERFORM pg_advisory_xact_lock(v_lock1);
              END IF;
            ELSE
              PERFORM pg_advisory_xact_lock(hashtext('char_alias_novel_' || v_novel_id::text));
            END IF;
          ELSE
            SELECT novel_id INTO v_novel_id FROM characters WHERE id = NEW.character_id FOR SHARE;
            IF v_novel_id IS NULL THEN
              RAISE EXCEPTION 'Referenced character % does not exist', NEW.character_id;
            END IF;

            PERFORM pg_advisory_xact_lock(hashtext('char_alias_novel_' || v_novel_id::text));
          END IF;

          -- Check for alias collision across any character belonging to the same novel
          IF EXISTS (
            SELECT 1 FROM character_aliases ca
            JOIN characters c ON ca.character_id = c.id
            WHERE c.novel_id = v_novel_id
              AND ca.alias = NEW.alias
              AND ca.id IS DISTINCT FROM NEW.id
          ) THEN
            RAISE EXCEPTION 'Unique alias violation: alias ''%'' already exists for novel %', NEW.alias, v_novel_id;
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_check_character_alias_novel_uniqueness
        BEFORE INSERT OR UPDATE OF character_id, alias ON character_aliases
        FOR EACH ROW EXECUTE FUNCTION fn_check_character_alias_novel_uniqueness();
    """)

    # Guard against characters.novel_id update causing alias collision in new novel
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_character_novel_update()
        RETURNS TRIGGER AS $$
        DECLARE
          v_lock1 BIGINT;
          v_lock2 BIGINT;
        BEGIN
          IF NEW.novel_id IS DISTINCT FROM OLD.novel_id THEN
            -- In characters BEFORE UPDATE trigger, PostgreSQL already holds an exclusive row lock on this character row.
            -- Acquire advisory locks for OLD and NEW novels in deterministic sorted order
            v_lock1 := hashtext('char_alias_novel_' || OLD.novel_id::text);
            v_lock2 := hashtext('char_alias_novel_' || NEW.novel_id::text);

            IF v_lock1 < v_lock2 THEN
              PERFORM pg_advisory_xact_lock(v_lock1);
              PERFORM pg_advisory_xact_lock(v_lock2);
            ELSIF v_lock1 > v_lock2 THEN
              PERFORM pg_advisory_xact_lock(v_lock2);
              PERFORM pg_advisory_xact_lock(v_lock1);
            ELSE
              PERFORM pg_advisory_xact_lock(v_lock1);
            END IF;

            IF EXISTS (
              SELECT 1 FROM character_aliases ca1
              JOIN character_aliases ca2 ON ca1.alias = ca2.alias
              JOIN characters c2 ON ca2.character_id = c2.id
              WHERE ca1.character_id = NEW.id
                AND c2.novel_id = NEW.novel_id
                AND c2.id IS DISTINCT FROM NEW.id
            ) THEN
              RAISE EXCEPTION 'Cannot update character novel_id: alias collision detected in target novel %', NEW.novel_id;
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_check_character_novel_update
        BEFORE UPDATE OF novel_id ON characters
        FOR EACH ROW EXECUTE FUNCTION fn_check_character_novel_update();
    """)

    # Read-compatible projection view v_character_aliases
    op.execute("""
        CREATE OR REPLACE VIEW v_character_aliases AS
        SELECT
          ca.id,
          c.novel_id,
          ca.character_id,
          ca.alias
        FROM character_aliases ca
        JOIN characters c ON ca.character_id = c.id;
    """)

    # --------------------------------------------------------------------------
    # 3. Drop redundant composite unique constraints from chapters & characters
    # --------------------------------------------------------------------------
    op.drop_constraint("uq_chapters_novel_id_id", "chapters", type_="unique")
    op.drop_constraint("uq_characters_novel_id_id", "characters", type_="unique")


def downgrade() -> None:
    # 0. Pre-downgrade state-dependent representation guard:
    # Legacy 3NF schema (0002) requires NOT NULL chapter_id with composite FK (novel_id, chapter_id) -> chapters(novel_id, id).
    # Bookmarks without playback_positions cannot be represented in 3NF without inventing synthetic progress data.
    # If any unplayed bookmarks exist, abort before altering schema to preserve all data.
    bind = op.get_bind()
    unrepresentable_count = bind.execute(sa.text("""
        SELECT count(*)
        FROM playback_history h
        WHERE NOT EXISTS (
            SELECT 1 FROM playback_positions p WHERE p.history_id = h.id
        );
    """)).scalar()

    if unrepresentable_count > 0:
        raise RuntimeError(
            f"Downgrade 0003 -> 0002 aborted: {unrepresentable_count} unplayed bookmark(s) in playback_history "
            f"have no playback_positions records. The legacy 3NF schema requires NOT NULL chapter_id referencing "
            f"an existing chapter in the novel. Downgrade cannot proceed without data loss or synthetic data invention. "
            f"All data has been preserved. To downgrade, either record progress for all bookmarks or delete unplayed bookmarks."
        )

    # 1. Restore composite unique constraints on chapters & characters
    op.create_unique_constraint("uq_characters_novel_id_id", "characters", ["novel_id", "id"])
    op.create_unique_constraint("uq_chapters_novel_id_id", "chapters", ["novel_id", "id"])

    # 2. Revert character_aliases
    op.execute("DROP VIEW IF EXISTS v_character_aliases CASCADE;")
    op.execute("DROP TRIGGER IF EXISTS trg_check_character_novel_update ON characters;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_character_novel_update();")
    op.execute("DROP TRIGGER IF EXISTS trg_check_character_alias_novel_uniqueness ON character_aliases;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_character_alias_novel_uniqueness();")

    op.drop_constraint("uq_character_aliases_character_alias", "character_aliases", type_="unique")
    op.drop_constraint("fk_character_aliases_character", "character_aliases", type_="foreignkey")

    op.add_column("character_aliases", sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("""
        UPDATE character_aliases ca
        SET novel_id = c.novel_id
        FROM characters c
        WHERE ca.character_id = c.id;
    """)
    op.alter_column("character_aliases", "novel_id", nullable=False)
    op.create_index(op.f("ix_character_aliases_novel_id"), "character_aliases", ["novel_id"], unique=False)
    op.create_unique_constraint("uq_character_aliases_novel_alias", "character_aliases", ["novel_id", "alias"])
    op.create_foreign_key(
        "fk_character_aliases_novel_character",
        "character_aliases",
        "characters",
        ["novel_id", "character_id"],
        ["novel_id", "id"],
        ondelete="CASCADE",
    )

    # 3. Revert playback_history and playback_positions
    op.execute("DROP VIEW IF EXISTS reading_progress CASCADE;")
    op.execute("DROP VIEW IF EXISTS v_playback_history CASCADE;")
    op.execute("DROP TRIGGER IF EXISTS trg_check_chapter_novel_update ON chapters;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_chapter_novel_update();")
    op.execute("DROP TRIGGER IF EXISTS trg_check_playback_history_novel_update ON playback_history;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_playback_history_novel_update();")
    op.execute("DROP TRIGGER IF EXISTS trg_check_playback_position_chapter_novel ON playback_positions;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_playback_position_chapter_novel();")

    op.add_column("playback_history", sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("playback_history", sa.Column("segment_order", sa.Integer(), nullable=True))
    op.add_column("playback_history", sa.Column("position_ms", sa.Integer(), nullable=True))
    op.add_column("playback_history", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))

    op.execute("""
        UPDATE playback_history h
        SET chapter_id = p.chapter_id,
            segment_order = p.segment_order,
            position_ms = p.position_ms,
            updated_at = p.updated_at
        FROM playback_positions p
        WHERE h.id = p.history_id;
    """)

    op.alter_column("playback_history", "updated_at", nullable=False)
    op.alter_column("playback_history", "chapter_id", nullable=False)
    op.alter_column("playback_history", "segment_order", nullable=False)
    op.alter_column("playback_history", "position_ms", nullable=False)

    op.create_index(op.f("ix_playback_history_chapter_id"), "playback_history", ["chapter_id"], unique=False)
    op.create_foreign_key(
        "fk_playback_history_novel_chapter",
        "playback_history",
        "chapters",
        ["novel_id", "chapter_id"],
        ["novel_id", "id"],
        ondelete="CASCADE",
    )
    op.drop_column("playback_history", "created_at")

    op.execute("CREATE OR REPLACE VIEW reading_progress AS SELECT * FROM playback_history;")

    op.drop_index(op.f("ix_playback_positions_chapter_id"), table_name="playback_positions")
    op.drop_table("playback_positions")
