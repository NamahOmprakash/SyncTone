"""0002_enforce_strict_3nf

Revision ID: 0002_enforce_strict_3nf
Revises: 0001_initial_schema
Create Date: 2026-10-14 13:45:00.000000

Strict 3NF normalization:
1. Enforces composite foreign key on playback_history (novel_id, chapter_id) -> chapters (novel_id, id).
2. Enforces composite foreign key on character_aliases (novel_id, character_id) -> characters (novel_id, id).
3. Decomposes synthesis_jobs into unified queue broker + target subtype tables:
   - novel_profile_job_targets (job_id PK, novel_id FK)
   - chapter_synthesis_job_targets (job_id PK, chapter_id FK)
4. Enforces database-level subtype matching, exclusivity, immutability, deferred completeness, and safe cascading deletion.
5. Provides read-compatible projection view v_synthesis_jobs.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_enforce_strict_3nf"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------------------------------
    # 1. Composite Unique Constraints to Support Composite Foreign Keys
    # --------------------------------------------------------------------------
    op.create_unique_constraint("uq_chapters_novel_id_id", "chapters", ["novel_id", "id"])
    op.create_unique_constraint("uq_characters_novel_id_id", "characters", ["novel_id", "id"])

    # --------------------------------------------------------------------------
    # 2. Referential Consistency on playback_history and character_aliases
    # --------------------------------------------------------------------------
    # Drop single-column foreign key in playback_history to replace with composite
    op.drop_constraint("playback_history_chapter_id_fkey", "playback_history", type_="foreignkey")
    op.create_foreign_key(
        "fk_playback_history_novel_chapter",
        "playback_history",
        "chapters",
        ["novel_id", "chapter_id"],
        ["novel_id", "id"],
        ondelete="CASCADE",
    )

    # Drop single-column foreign key in character_aliases to replace with composite
    op.drop_constraint("character_aliases_character_id_fkey", "character_aliases", type_="foreignkey")
    op.create_foreign_key(
        "fk_character_aliases_novel_character",
        "character_aliases",
        "characters",
        ["novel_id", "character_id"],
        ["novel_id", "id"],
        ondelete="CASCADE",
    )

    # --------------------------------------------------------------------------
    # 3. Create Target Subtype Relations (Strict BCNF / 3NF)
    # --------------------------------------------------------------------------
    op.create_table(
        "novel_profile_job_targets",
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["synthesis_jobs.id"],
            ondelete="CASCADE",
            name="fk_novel_target_job",
        ),
        sa.ForeignKeyConstraint(
            ["novel_id"],
            ["novels.id"],
            ondelete="CASCADE",
            name="fk_novel_target_novel",
        ),
        sa.PrimaryKeyConstraint("job_id", name="pk_novel_profile_job_targets"),
    )
    op.create_index(
        op.f("ix_novel_profile_job_targets_novel_id"),
        "novel_profile_job_targets",
        ["novel_id"],
        unique=False,
    )

    op.create_table(
        "chapter_synthesis_job_targets",
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["synthesis_jobs.id"],
            ondelete="CASCADE",
            name="fk_chapter_target_job",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["chapters.id"],
            ondelete="CASCADE",
            name="fk_chapter_target_chapter",
        ),
        sa.PrimaryKeyConstraint("job_id", name="pk_chapter_synthesis_job_targets"),
    )
    op.create_index(
        op.f("ix_chapter_synthesis_job_targets_chapter_id"),
        "chapter_synthesis_job_targets",
        ["chapter_id"],
        unique=False,
    )

    # --------------------------------------------------------------------------
    # 4. Migrate Existing Target Data from synthesis_jobs (Lossless)
    # --------------------------------------------------------------------------
    op.execute("""
        INSERT INTO novel_profile_job_targets (job_id, novel_id)
        SELECT id, novel_id FROM synthesis_jobs
        WHERE job_type = 'profile_novel' AND novel_id IS NOT NULL;
    """)

    op.execute("""
        INSERT INTO chapter_synthesis_job_targets (job_id, chapter_id)
        SELECT id, chapter_id FROM synthesis_jobs
        WHERE job_type = 'synthesize_chapter' AND chapter_id IS NOT NULL;
    """)

    # --------------------------------------------------------------------------
    # 5. Cleanse synthesis_jobs Base Table
    # --------------------------------------------------------------------------
    # Drop legacy check constraint and foreign keys
    op.drop_constraint("chk_jobs_type_chapter_match", "synthesis_jobs", type_="check")
    op.drop_constraint("synthesis_jobs_chapter_id_fkey", "synthesis_jobs", type_="foreignkey")
    op.drop_constraint("synthesis_jobs_novel_id_fkey", "synthesis_jobs", type_="foreignkey")

    # Drop old indexes on target columns
    op.drop_index(op.f("ix_synthesis_jobs_chapter_id"), table_name="synthesis_jobs")
    op.drop_index(op.f("ix_synthesis_jobs_novel_id"), table_name="synthesis_jobs")

    # Drop target columns from queue broker table
    op.drop_column("synthesis_jobs", "chapter_id")
    op.drop_column("synthesis_jobs", "novel_id")

    # Explicit check constraint for allowed job types
    op.create_check_constraint(
        "chk_synthesis_jobs_job_type",
        "synthesis_jobs",
        "job_type IN ('profile_novel', 'synthesize_chapter')",
    )

    # --------------------------------------------------------------------------
    # 6. Database-Level Subtype Matching, Exclusivity & Immutability Functions/Triggers
    # --------------------------------------------------------------------------
    # A. Subtype matching & exclusivity for novel_profile_job_targets
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_novel_profile_target_subtype()
        RETURNS TRIGGER AS $$
        DECLARE
          v_job_type VARCHAR(30);
        BEGIN
          SELECT job_type INTO v_job_type FROM synthesis_jobs WHERE id = NEW.job_id;
          IF v_job_type IS NULL THEN
            RAISE EXCEPTION 'Target subtype violation: referenced synthesis_job % does not exist', NEW.job_id;
          ELSIF v_job_type != 'profile_novel' THEN
            RAISE EXCEPTION 'Target subtype mismatch: novel_profile_job_targets can only target jobs with job_type = ''profile_novel'' (job % has job_type = ''%'')', NEW.job_id, v_job_type;
          END IF;
          IF EXISTS (SELECT 1 FROM chapter_synthesis_job_targets WHERE job_id = NEW.job_id) THEN
            RAISE EXCEPTION 'Target exclusivity violation: job % is already assigned to chapter_synthesis_job_targets', NEW.job_id;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_check_novel_profile_target_subtype
        BEFORE INSERT OR UPDATE ON novel_profile_job_targets
        FOR EACH ROW EXECUTE FUNCTION fn_check_novel_profile_target_subtype();
    """)

    # B. Subtype matching & exclusivity for chapter_synthesis_job_targets
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_chapter_synthesis_target_subtype()
        RETURNS TRIGGER AS $$
        DECLARE
          v_job_type VARCHAR(30);
        BEGIN
          SELECT job_type INTO v_job_type FROM synthesis_jobs WHERE id = NEW.job_id;
          IF v_job_type IS NULL THEN
            RAISE EXCEPTION 'Target subtype violation: referenced synthesis_job % does not exist', NEW.job_id;
          ELSIF v_job_type != 'synthesize_chapter' THEN
            RAISE EXCEPTION 'Target subtype mismatch: chapter_synthesis_job_targets can only target jobs with job_type = ''synthesize_chapter'' (job % has job_type = ''%'')', NEW.job_id, v_job_type;
          END IF;
          IF EXISTS (SELECT 1 FROM novel_profile_job_targets WHERE job_id = NEW.job_id) THEN
            RAISE EXCEPTION 'Target exclusivity violation: job % is already assigned to novel_profile_job_targets', NEW.job_id;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_check_chapter_synthesis_target_subtype
        BEFORE INSERT OR UPDATE ON chapter_synthesis_job_targets
        FOR EACH ROW EXECUTE FUNCTION fn_check_chapter_synthesis_target_subtype();
    """)

    # C. Target immutability triggers (preventing reassignment loophole)
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_prevent_job_target_reassignment()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
            RAISE EXCEPTION 'Target immutability violation: job_id cannot be reassigned (attempted to change % to %)', OLD.job_id, NEW.job_id;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_01_prevent_reassign_novel_target
        BEFORE UPDATE OF job_id ON novel_profile_job_targets
        FOR EACH ROW EXECUTE FUNCTION fn_prevent_job_target_reassignment();

        CREATE TRIGGER trg_01_prevent_reassign_chapter_target
        BEFORE UPDATE OF job_id ON chapter_synthesis_job_targets
        FOR EACH ROW EXECUTE FUNCTION fn_prevent_job_target_reassignment();
    """)

    # D. Deferred target completeness trigger (ignores same-transaction deletions)
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_check_synthesis_job_target_completeness()
        RETURNS TRIGGER AS $$
        DECLARE
          v_job_type VARCHAR(30);
        BEGIN
          -- If the job was deleted within the same transaction prior to commit, ignore it
          SELECT job_type INTO v_job_type FROM synthesis_jobs WHERE id = NEW.id;
          IF NOT FOUND THEN
            RETURN NULL;
          END IF;

          IF v_job_type = 'profile_novel' THEN
            IF NOT EXISTS (SELECT 1 FROM novel_profile_job_targets WHERE job_id = NEW.id) THEN
              RAISE EXCEPTION 'Target completeness violation: synthesis_job % of type profile_novel has no matching target row in novel_profile_job_targets at commit time', NEW.id;
            END IF;
          ELSIF v_job_type = 'synthesize_chapter' THEN
            IF NOT EXISTS (SELECT 1 FROM chapter_synthesis_job_targets WHERE job_id = NEW.id) THEN
              RAISE EXCEPTION 'Target completeness violation: synthesis_job % of type synthesize_chapter has no matching target row in chapter_synthesis_job_targets at commit time', NEW.id;
            END IF;
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE CONSTRAINT TRIGGER trg_synthesis_job_target_completeness
        AFTER INSERT OR UPDATE ON synthesis_jobs
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION fn_check_synthesis_job_target_completeness();
    """)

    # E. Safe, re-entrant-guarded deletion triggers (parent cascade)
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_delete_parent_synthesis_job()
        RETURNS TRIGGER AS $$
        BEGIN
          -- Guard against re-entrancy: if synthesis_jobs row was already deleted, do nothing
          IF EXISTS (SELECT 1 FROM synthesis_jobs WHERE id = OLD.job_id) THEN
            DELETE FROM synthesis_jobs WHERE id = OLD.job_id;
          END IF;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_cascade_delete_novel_job
        AFTER DELETE ON novel_profile_job_targets
        FOR EACH ROW EXECUTE FUNCTION fn_delete_parent_synthesis_job();

        CREATE TRIGGER trg_cascade_delete_chapter_job
        AFTER DELETE ON chapter_synthesis_job_targets
        FOR EACH ROW EXECUTE FUNCTION fn_delete_parent_synthesis_job();
    """)

    # --------------------------------------------------------------------------
    # 7. Backward-Compatible Projection View (Read-Only)
    # --------------------------------------------------------------------------
    op.execute("""
        CREATE OR REPLACE VIEW v_synthesis_jobs AS
        SELECT
          j.id,
          COALESCE(np.novel_id, c.novel_id) AS novel_id,
          cs.chapter_id,
          j.requested_by,
          j.job_type,
          j.status,
          j.progress_pct,
          j.attempts,
          j.max_attempts,
          j.run_after,
          j.worker_id,
          j.locked_at,
          j.error_message,
          j.created_at,
          j.completed_at
        FROM synthesis_jobs j
        LEFT JOIN novel_profile_job_targets np ON j.id = np.job_id
        LEFT JOIN chapter_synthesis_job_targets cs ON j.id = cs.job_id
        LEFT JOIN chapters c ON cs.chapter_id = c.id;
    """)


def downgrade() -> None:
    # 1. Drop projection view and triggers
    op.execute("DROP VIEW IF EXISTS v_synthesis_jobs CASCADE;")
    op.execute("DROP TRIGGER IF EXISTS trg_cascade_delete_novel_job ON novel_profile_job_targets;")
    op.execute("DROP TRIGGER IF EXISTS trg_cascade_delete_chapter_job ON chapter_synthesis_job_targets;")
    op.execute("DROP FUNCTION IF EXISTS fn_delete_parent_synthesis_job();")
    op.execute("DROP TRIGGER IF EXISTS trg_synthesis_job_target_completeness ON synthesis_jobs;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_synthesis_job_target_completeness();")
    op.execute("DROP TRIGGER IF EXISTS trg_01_prevent_reassign_novel_target ON novel_profile_job_targets;")
    op.execute("DROP TRIGGER IF EXISTS trg_01_prevent_reassign_chapter_target ON chapter_synthesis_job_targets;")
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_reassign_novel_target ON novel_profile_job_targets;")
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_reassign_chapter_target ON chapter_synthesis_job_targets;")
    op.execute("DROP FUNCTION IF EXISTS fn_prevent_job_target_reassignment();")
    op.execute("DROP TRIGGER IF EXISTS trg_check_novel_profile_target_subtype ON novel_profile_job_targets;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_novel_profile_target_subtype();")
    op.execute("DROP TRIGGER IF EXISTS trg_check_chapter_synthesis_target_subtype ON chapter_synthesis_job_targets;")
    op.execute("DROP FUNCTION IF EXISTS fn_check_chapter_synthesis_target_subtype();")

    # 2. Re-add target columns to synthesis_jobs
    op.add_column("synthesis_jobs", sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("synthesis_jobs", sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=True))

    # 3. Restore data from target tables
    op.execute("""
        UPDATE synthesis_jobs j
        SET novel_id = np.novel_id
        FROM novel_profile_job_targets np
        WHERE j.id = np.job_id;
    """)
    op.execute("""
        UPDATE synthesis_jobs j
        SET chapter_id = cs.chapter_id,
            novel_id = c.novel_id
        FROM chapter_synthesis_job_targets cs
        JOIN chapters c ON cs.chapter_id = c.id
        WHERE j.id = cs.job_id;
    """)

    # Make novel_id NOT NULL again
    op.alter_column("synthesis_jobs", "novel_id", nullable=False)

    # 4. Restore indexes and foreign keys on synthesis_jobs
    op.create_foreign_key(
        "synthesis_jobs_novel_id_fkey",
        "synthesis_jobs",
        "novels",
        ["novel_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "synthesis_jobs_chapter_id_fkey",
        "synthesis_jobs",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_synthesis_jobs_novel_id"), "synthesis_jobs", ["novel_id"], unique=False)
    op.create_index(op.f("ix_synthesis_jobs_chapter_id"), "synthesis_jobs", ["chapter_id"], unique=False)

    op.drop_constraint("chk_synthesis_jobs_job_type", "synthesis_jobs", type_="check")
    op.create_check_constraint(
        "chk_jobs_type_chapter_match",
        "synthesis_jobs",
        "(job_type = 'profile_novel' AND chapter_id IS NULL) OR (job_type = 'synthesize_chapter' AND chapter_id IS NOT NULL)",
    )

    # 5. Drop target tables
    op.drop_index(op.f("ix_chapter_synthesis_job_targets_chapter_id"), table_name="chapter_synthesis_job_targets")
    op.drop_table("chapter_synthesis_job_targets")
    op.drop_index(op.f("ix_novel_profile_job_targets_novel_id"), table_name="novel_profile_job_targets")
    op.drop_table("novel_profile_job_targets")

    # 6. Restore original foreign keys on playback_history and character_aliases
    op.drop_constraint("fk_character_aliases_novel_character", "character_aliases", type_="foreignkey")
    op.create_foreign_key(
        "character_aliases_character_id_fkey",
        "character_aliases",
        "characters",
        ["character_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("fk_playback_history_novel_chapter", "playback_history", type_="foreignkey")
    op.create_foreign_key(
        "playback_history_chapter_id_fkey",
        "playback_history",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("uq_characters_novel_id_id", "characters", type_="unique")
    op.drop_constraint("uq_chapters_novel_id_id", "chapters", type_="unique")
