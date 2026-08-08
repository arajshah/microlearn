/**
 * Content schema migrations. Each migration has a stable id and idempotent SQL.
 * JSON-heavy columns keep the schema simple while matching the app's shapes.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0001_content_core',
    sql: `
      CREATE TABLE IF NOT EXISTS roadmaps (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        topic TEXT NOT NULL,
        goal TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mastery_level INTEGER NOT NULL DEFAULT 3,
        depth TEXT NOT NULL DEFAULT 'standard',
        status TEXT NOT NULL DEFAULT 'draft',
        estimated_total_minutes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS roadmap_units (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        unit_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lesson_nodes (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
        unit_id TEXT NOT NULL REFERENCES roadmap_units(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        short_description TEXT NOT NULL DEFAULT '',
        learning_objective TEXT NOT NULL DEFAULT '',
        estimated_minutes INTEGER NOT NULL DEFAULT 0,
        difficulty INTEGER NOT NULL DEFAULT 1,
        node_order INTEGER NOT NULL DEFAULT 0,
        prerequisite_ids_json TEXT NOT NULL DEFAULT '[]',
        key_ideas_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'locked',
        generated_lesson_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lesson_blueprints (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
        lesson_node_id TEXT NOT NULL REFERENCES lesson_nodes(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        blueprint_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generated_lessons (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
        lesson_node_id TEXT NOT NULL REFERENCES lesson_nodes(id) ON DELETE CASCADE,
        blueprint_id TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        lesson_json TEXT NOT NULL,
        model TEXT,
        prompt_version TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lesson_outcomes (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
        lesson_node_id TEXT NOT NULL,
        lesson_id TEXT,
        outcome_json TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS content_versions (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT '',
        snapshot_json TEXT NOT NULL,
        change_summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_roadmaps_status ON roadmaps(status);
      CREATE INDEX IF NOT EXISTS idx_units_roadmap ON roadmap_units(roadmap_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_roadmap ON lesson_nodes(roadmap_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_unit ON lesson_nodes(unit_id);
      CREATE INDEX IF NOT EXISTS idx_generated_node ON generated_lessons(lesson_node_id);
      CREATE INDEX IF NOT EXISTS idx_outcomes_roadmap ON lesson_outcomes(roadmap_id);
      CREATE INDEX IF NOT EXISTS idx_content_versions_entity ON content_versions(entity_type, entity_id);
    `,
  },
  {
    id: '0002_audit_and_progress',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        before_json TEXT,
        after_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_entity
        ON audit_events(entity_type, entity_id);

      CREATE INDEX IF NOT EXISTS idx_audit_events_created
        ON audit_events(created_at);

      CREATE TABLE IF NOT EXISTS progress_events (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT NOT NULL,
        lesson_node_id TEXT,
        lesson_id TEXT,
        event_type TEXT NOT NULL,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_progress_roadmap ON progress_events(roadmap_id);
      CREATE INDEX IF NOT EXISTS idx_progress_node ON progress_events(lesson_node_id);
    `,
  },
  {
    id: '0003_source_documents',
    sql: `
      CREATE TABLE IF NOT EXISTS source_documents (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        url TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        title TEXT,
        mime_type TEXT,
        status TEXT NOT NULL,
        extracted_text TEXT,
        summary_json TEXT,
        metadata_json TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_source_documents_status
        ON source_documents(status);

      CREATE INDEX IF NOT EXISTS idx_source_documents_normalized_url
        ON source_documents(normalized_url);
    `,
  },
  {
    id: '0004_retrieval_engine',
    sql: `
      CREATE TABLE IF NOT EXISTS retrieval_items (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT,
        lesson_node_id TEXT,
        lesson_id TEXT,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        item_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        answer TEXT,
        explanation TEXT,
        concept TEXT,
        difficulty INTEGER,
        status TEXT NOT NULL,
        due_at TEXT NOT NULL,
        last_reviewed_at TEXT,
        reps INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        ease REAL NOT NULL DEFAULT 2.5,
        interval_days INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS retrieval_sessions (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        total_items INTEGER NOT NULL DEFAULT 0,
        remembered_count INTEGER NOT NULL DEFAULT 0,
        partial_count INTEGER NOT NULL DEFAULT 0,
        forgot_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS retrieval_attempts (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        item_id TEXT NOT NULL,
        rating TEXT NOT NULL,
        response_text TEXT,
        correct BOOLEAN,
        duration_ms INTEGER,
        previous_due_at TEXT,
        next_due_at TEXT,
        created_at TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (item_id) REFERENCES retrieval_items(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES retrieval_sessions(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_retrieval_items_due
        ON retrieval_items(status, due_at);

      CREATE INDEX IF NOT EXISTS idx_retrieval_items_lesson
        ON retrieval_items(lesson_id);

      CREATE INDEX IF NOT EXISTS idx_retrieval_items_roadmap
        ON retrieval_items(roadmap_id);

      CREATE INDEX IF NOT EXISTS idx_retrieval_attempts_item
        ON retrieval_attempts(item_id);

      CREATE INDEX IF NOT EXISTS idx_retrieval_attempts_session
        ON retrieval_attempts(session_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_retrieval_items_source_ref
        ON retrieval_items(lesson_id, source_ref);
    `,
  },
  {
    id: '0005_gamification',
    sql: `
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        tier TEXT NOT NULL,
        icon TEXT,
        accent TEXT,
        criteria_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_achievements (
        id TEXT PRIMARY KEY,
        achievement_id TEXT NOT NULL,
        unlocked_at TEXT NOT NULL,
        progress_value INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT,
        FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS daily_activity (
        id TEXT PRIMARY KEY,
        day TEXT NOT NULL UNIQUE,
        lessons_completed INTEGER NOT NULL DEFAULT 0,
        retrieval_items_reviewed INTEGER NOT NULL DEFAULT 0,
        retrieval_remembered INTEGER NOT NULL DEFAULT 0,
        retrieval_partial INTEGER NOT NULL DEFAULT 0,
        retrieval_forgot INTEGER NOT NULL DEFAULT 0,
        xp_earned INTEGER NOT NULL DEFAULT 0,
        active_minutes INTEGER NOT NULL DEFAULT 0,
        roadmap_progress_events INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_streaks (
        id TEXT PRIMARY KEY,
        streak_type TEXT NOT NULL UNIQUE,
        current_count INTEGER NOT NULL DEFAULT 0,
        best_count INTEGER NOT NULL DEFAULT 0,
        last_active_day TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked
        ON user_achievements(unlocked_at);

      CREATE INDEX IF NOT EXISTS idx_daily_activity_day
        ON daily_activity(day);
    `,
  },
  {
    id: '0006_review_sets',
    sql: `
      CREATE TABLE IF NOT EXISTS review_sets (
        id TEXT PRIMARY KEY,
        lesson_id TEXT NOT NULL,
        roadmap_id TEXT,
        lesson_node_id TEXT,
        title TEXT NOT NULL,
        strategy TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        due_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT
      );

      ALTER TABLE retrieval_items ADD COLUMN review_set_id TEXT;
      ALTER TABLE retrieval_items ADD COLUMN choices_json TEXT;

      CREATE INDEX IF NOT EXISTS idx_review_sets_due
        ON review_sets(status, due_at);

      CREATE INDEX IF NOT EXISTS idx_review_sets_lesson
        ON review_sets(lesson_id);

      CREATE INDEX IF NOT EXISTS idx_retrieval_items_review_set
        ON retrieval_items(review_set_id);
    `,
  },
  {
    id: '0007_backend_storage_truth',
    sql: `
      CREATE TABLE IF NOT EXISTS generated_lessons_v2 (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT,
        lesson_node_id TEXT,
        blueprint_id TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        lesson_json TEXT NOT NULL,
        model TEXT,
        prompt_version TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        subject_id TEXT,
        topic TEXT,
        title TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE SET NULL
      );

      INSERT INTO generated_lessons_v2 (
        id, roadmap_id, lesson_node_id, blueprint_id, version, lesson_json, model, prompt_version,
        status, created_at, updated_at
      )
      SELECT
        id, roadmap_id, lesson_node_id, blueprint_id, version, lesson_json, model, prompt_version,
        'active', created_at, updated_at
      FROM generated_lessons;

      DROP TABLE generated_lessons;
      ALTER TABLE generated_lessons_v2 RENAME TO generated_lessons;

      CREATE INDEX IF NOT EXISTS idx_generated_lessons_status ON generated_lessons(status);
      CREATE INDEX IF NOT EXISTS idx_generated_lessons_updated ON generated_lessons(updated_at);
      CREATE INDEX IF NOT EXISTS idx_generated_lessons_roadmap ON generated_lessons(roadmap_id);
      CREATE INDEX IF NOT EXISTS idx_generated_lessons_node ON generated_lessons(lesson_node_id);
    `,
  },
  {
    id: '0008_adaptive_learning',
    sql: `
      CREATE TABLE IF NOT EXISTS concepts (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        subject_id TEXT,
        topic TEXT,
        aliases_json TEXT DEFAULT '[]',
        prerequisite_slugs_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lesson_concepts (
        id TEXT PRIMARY KEY,
        lesson_id TEXT NOT NULL,
        roadmap_id TEXT,
        lesson_node_id TEXT,
        card_id TEXT,
        concept_slug TEXT NOT NULL,
        skill_tag TEXT,
        weight REAL DEFAULT 1.0,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_lesson_concepts_lesson ON lesson_concepts(lesson_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_concepts_roadmap ON lesson_concepts(roadmap_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_concepts_node ON lesson_concepts(lesson_node_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_concepts_card ON lesson_concepts(card_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_concepts_concept ON lesson_concepts(concept_slug);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_concepts_unique
        ON lesson_concepts(lesson_id, IFNULL(card_id, ''), concept_slug);

      CREATE TABLE IF NOT EXISTS learning_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        roadmap_id TEXT,
        lesson_node_id TEXT,
        lesson_id TEXT,
        card_id TEXT,
        concept_slug TEXT,
        skill_tag TEXT,
        correct INTEGER,
        selected_answer_json TEXT,
        expected_answer_json TEXT,
        response_time_ms INTEGER,
        confidence INTEGER,
        difficulty_rating INTEGER,
        source TEXT,
        metadata_json TEXT DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_learning_events_timestamp ON learning_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_learning_events_type ON learning_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_learning_events_concept ON learning_events(concept_slug);
      CREATE INDEX IF NOT EXISTS idx_learning_events_lesson ON learning_events(lesson_id);
      CREATE INDEX IF NOT EXISTS idx_learning_events_roadmap ON learning_events(roadmap_id);

      CREATE TABLE IF NOT EXISTS concept_mastery (
        concept_slug TEXT PRIMARY KEY,
        name TEXT,
        subject_id TEXT,
        topic TEXT,
        mastery_score REAL NOT NULL DEFAULT 0.0,
        confidence_score REAL NOT NULL DEFAULT 0.0,
        exposure_count INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        incorrect_count INTEGER NOT NULL DEFAULT 0,
        streak_correct INTEGER NOT NULL DEFAULT 0,
        last_seen_at TEXT,
        next_review_at TEXT,
        trend TEXT DEFAULT 'unknown',
        evidence_json TEXT DEFAULT '[]',
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_concept_mastery_score ON concept_mastery(mastery_score);
      CREATE INDEX IF NOT EXISTS idx_concept_mastery_due ON concept_mastery(next_review_at);
      CREATE INDEX IF NOT EXISTS idx_concept_mastery_updated ON concept_mastery(updated_at);

      CREATE TABLE IF NOT EXISTS weakness_observations (
        id TEXT PRIMARY KEY,
        concept_slug TEXT NOT NULL,
        weakness_tag TEXT NOT NULL,
        severity REAL NOT NULL DEFAULT 0.5,
        status TEXT NOT NULL DEFAULT 'active',
        evidence_event_ids_json TEXT DEFAULT '[]',
        evidence_summary TEXT,
        recommended_action TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_weakness_concept ON weakness_observations(concept_slug);
      CREATE INDEX IF NOT EXISTS idx_weakness_status ON weakness_observations(status);
      CREATE INDEX IF NOT EXISTS idx_weakness_severity ON weakness_observations(severity);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_weakness_active_unique
        ON weakness_observations(concept_slug, weakness_tag, status);

      CREATE TABLE IF NOT EXISTS diagnostic_sessions (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT,
        topic TEXT NOT NULL,
        goal TEXT,
        mastery_level INTEGER,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_roadmap ON diagnostic_sessions(roadmap_id);
      CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_status ON diagnostic_sessions(status);

      CREATE TABLE IF NOT EXISTS diagnostic_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        concept_slug TEXT NOT NULL,
        question TEXT NOT NULL,
        options_json TEXT NOT NULL,
        answer_index INTEGER NOT NULL,
        explanation TEXT,
        cognitive_level TEXT,
        difficulty INTEGER,
        answered_correctly INTEGER,
        selected_index INTEGER,
        response_time_ms INTEGER,
        created_at TEXT NOT NULL,
        answered_at TEXT,
        FOREIGN KEY (session_id) REFERENCES diagnostic_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_diagnostic_items_session ON diagnostic_items(session_id);
      CREATE INDEX IF NOT EXISTS idx_diagnostic_items_concept ON diagnostic_items(concept_slug);

      CREATE TABLE IF NOT EXISTS remediation_queue (
        id TEXT PRIMARY KEY,
        concept_slug TEXT NOT NULL,
        roadmap_id TEXT,
        lesson_node_id TEXT,
        severity REAL NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        suggested_lesson_title TEXT,
        generated_lesson_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_remediation_concept ON remediation_queue(concept_slug);
      CREATE INDEX IF NOT EXISTS idx_remediation_status ON remediation_queue(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_remediation_open_unique
        ON remediation_queue(concept_slug, status);

      CREATE TABLE IF NOT EXISTS learning_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        strengths_json TEXT DEFAULT '[]',
        weaknesses_json TEXT DEFAULT '[]',
        due_reviews_json TEXT DEFAULT '[]',
        recommendations_json TEXT DEFAULT '[]',
        stats_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_learning_snapshots_type ON learning_snapshots(snapshot_type);
      CREATE INDEX IF NOT EXISTS idx_learning_snapshots_created ON learning_snapshots(created_at);
    `,
  },
  {
    id: '0009_trusted_automation',
    sql: `
      CREATE TABLE IF NOT EXISTS trusted_automation_grants (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        oauth_client_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        capabilities_json TEXT NOT NULL,
        roadmap_ids_json TEXT,
        daily_operation_limit INTEGER,
        daily_operation_count INTEGER NOT NULL DEFAULT 0,
        daily_operation_day TEXT,
        execution_windows_json TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        expires_at TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0,
        circuit_breaker_state TEXT NOT NULL DEFAULT 'closed',
        circuit_breaker_reason TEXT,
        allow_whole_roadmap_delete INTEGER NOT NULL DEFAULT 0,
        allow_badge_definition_changes INTEGER NOT NULL DEFAULT 0,
        audit_metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_grants_identity_active
        ON trusted_automation_grants(user_id, IFNULL(oauth_client_id, ''))
        WHERE status IN ('active', 'paused', 'circuit-broken');
      CREATE INDEX IF NOT EXISTS idx_trusted_grants_status
        ON trusted_automation_grants(status, expires_at);

      CREATE TABLE IF NOT EXISTS automation_schedules (
        id TEXT PRIMARY KEY,
        grant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        schedule_type TEXT NOT NULL,
        schedule_json TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        next_run_at TEXT,
        last_run_at TEXT,
        retry_limit INTEGER NOT NULL DEFAULT 3,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (grant_id) REFERENCES trusted_automation_grants(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_schedule_idempotency
        ON automation_schedules(grant_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_automation_schedule_due
        ON automation_schedules(status, next_run_at);

      CREATE TABLE IF NOT EXISTS automation_job_executions (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        grant_id TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        attempt INTEGER NOT NULL DEFAULT 1,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        result_json TEXT,
        error_code TEXT,
        FOREIGN KEY (schedule_id) REFERENCES automation_schedules(id) ON DELETE CASCADE,
        FOREIGN KEY (grant_id) REFERENCES trusted_automation_grants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_automation_executions_schedule
        ON automation_job_executions(schedule_id, started_at);

      CREATE TABLE IF NOT EXISTS automation_reminders (
        id TEXT PRIMARY KEY,
        grant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        roadmap_id TEXT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'in_app',
        status TEXT NOT NULL DEFAULT 'active',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        schedule_json TEXT NOT NULL,
        next_trigger_at TEXT,
        last_triggered_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (grant_id) REFERENCES trusted_automation_grants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_automation_reminders_due
        ON automation_reminders(status, next_trigger_at);

      CREATE TABLE IF NOT EXISTS notification_jobs (
        id TEXT PRIMARY KEY,
        reminder_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (reminder_id) REFERENCES automation_reminders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notification_jobs_status
        ON notification_jobs(status, scheduled_for);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_idempotency
        ON notification_jobs(reminder_id, scheduled_for);

      CREATE TABLE IF NOT EXISTS automation_audit_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        oauth_client_id TEXT,
        grant_id TEXT,
        job_id TEXT,
        tool_name TEXT NOT NULL,
        target_ids_json TEXT,
        capability TEXT,
        result TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_automation_audit_grant
        ON automation_audit_events(grant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_automation_audit_tool
        ON automation_audit_events(tool_name, created_at);
    `,
  },
  {
    id: '0010_review_integrity_and_roadmap_counts',
    sql: `
      DROP INDEX IF EXISTS idx_retrieval_items_source_ref;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_retrieval_items_source_ref_active
        ON retrieval_items(lesson_id, source_ref)
        WHERE status != 'deleted';

      UPDATE retrieval_items
      SET review_set_id = (
        SELECT keeper.id
        FROM review_sets AS old_set
        JOIN review_sets AS keeper ON keeper.lesson_id = old_set.lesson_id
        WHERE old_set.id = retrieval_items.review_set_id
          AND keeper.status = 'active'
        ORDER BY keeper.created_at DESC, keeper.id DESC
        LIMIT 1
      )
      WHERE review_set_id IN (
        SELECT older.id
        FROM review_sets AS older
        WHERE older.status = 'active'
          AND older.id != (
            SELECT newest.id
            FROM review_sets AS newest
            WHERE newest.lesson_id = older.lesson_id AND newest.status = 'active'
            ORDER BY newest.created_at DESC, newest.id DESC
            LIMIT 1
          )
      );

      UPDATE review_sets
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'active'
        AND id != (
          SELECT newest.id
          FROM review_sets AS newest
          WHERE newest.lesson_id = review_sets.lesson_id AND newest.status = 'active'
          ORDER BY newest.created_at DESC, newest.id DESC
          LIMIT 1
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_review_sets_lesson_active
        ON review_sets(lesson_id)
        WHERE status = 'active';
    `,
  },
  {
    id: '0011_server_generation_jobs',
    sql: `
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        status TEXT NOT NULL,
        request_json TEXT NOT NULL DEFAULT '{}',
        result_entity_id TEXT,
        error_code TEXT,
        error_message TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_generation_jobs_status
        ON generation_jobs(status, updated_at);

      CREATE INDEX IF NOT EXISTS idx_generation_jobs_entity
        ON generation_jobs(entity_type, entity_id);

      UPDATE generated_lessons
      SET status = 'archived'
      WHERE status = 'active'
        AND lesson_node_id IS NOT NULL
        AND id NOT IN (
          SELECT newest.id
          FROM generated_lessons AS newest
          WHERE newest.lesson_node_id = generated_lessons.lesson_node_id
            AND newest.status = 'active'
          ORDER BY newest.updated_at DESC, newest.id DESC
          LIMIT 1
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_lessons_active_node_unique
        ON generated_lessons(lesson_node_id)
        WHERE status = 'active' AND lesson_node_id IS NOT NULL;
    `,
  },
  {
    id: '0012_curriculum_steward',
    sql: `
      CREATE TABLE IF NOT EXISTS curriculum_steward_charters (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        content TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_steward_charter_active
        ON curriculum_steward_charters(is_active)
        WHERE is_active = 1;

      CREATE TABLE IF NOT EXISTS curriculum_strategies (
        id TEXT PRIMARY KEY,
        strategy_version INTEGER NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        current_phase TEXT NOT NULL,
        priorities_json TEXT NOT NULL DEFAULT '[]',
        deprioritized_areas_json TEXT NOT NULL DEFAULT '[]',
        active_hypotheses_json TEXT NOT NULL DEFAULT '[]',
        near_term_objectives_json TEXT NOT NULL DEFAULT '[]',
        upcoming_plan_json TEXT NOT NULL DEFAULT '[]',
        concerns_json TEXT NOT NULL DEFAULT '[]',
        last_reviewed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_curriculum_strategies_version
        ON curriculum_strategies(strategy_version DESC);

      CREATE TABLE IF NOT EXISTS curriculum_steward_runs (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE,
        actor TEXT NOT NULL,
        status TEXT NOT NULL,
        strategy_version_before INTEGER,
        strategy_version_after INTEGER,
        summary TEXT,
        actions_json TEXT NOT NULL DEFAULT '[]',
        error_code TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_steward_one_running
        ON curriculum_steward_runs(status)
        WHERE status = 'running';

      CREATE INDEX IF NOT EXISTS idx_curriculum_steward_runs_recent
        ON curriculum_steward_runs(started_at DESC);

      INSERT OR IGNORE INTO curriculum_steward_charters
        (id, version, content, is_active, created_at, updated_at)
      VALUES (
        'default-curriculum-steward-charter',
        1,
        'Microlearn Curriculum Steward

Mission:
Guide the learner toward exceptional AI/ML scientist-engineer capability by May 2028.

Optimize for genuine mastery, technical depth, research ability, empirical judgment, and serious software-building ability rather than content volume, streak optimization, or superficial completion.

Core learning areas include:
- mathematics and statistical foundations
- classical machine learning
- deep learning
- modern foundation models
- reasoning
- world models
- grounded intelligent systems and agents
- ML systems
- evaluation and reliability
- experimental methodology
- deep paper reading and reproduction
- serious implementation work
- original defensible research

Learning philosophy:
- Favor active work over passive consumption.
- Approximately 70% of learning effort should involve implementation, experimentation, retrieval, problem solving, evaluation, reproduction, or research.
- Maintain continuity across lessons and roadmaps.
- Revisit weak concepts rather than merely progressing forward.
- Prefer depth when a topic is strategically important.
- Use prerequisite-aware progression.
- Keep the curriculum challenging but sustainable.
- Do not generate material merely to keep the application busy.

Autonomy:
The Curriculum Steward may create, publish, reorder, revise, archive, or retire curriculum when justified by the learner''s state.

Safety:
- Never delete learning history.
- Never delete mastery records.
- Never delete review history.
- Never delete achievements.
- Never delete audit history.
- Never silently rewrite completed lessons.
- Preserve completed curriculum as historical evidence.
- Prefer archival over permanent deletion.
- Permanent deletion is appropriate only for unused drafts, exact duplicates, malformed generated content, or clearly abandoned zero-progress material.

Decision policy:
A steward run is allowed to make no changes.
Do not manufacture interventions when the existing learning plan remains appropriate.

Every meaningful curriculum change should leave a concise audit rationale.',
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO curriculum_strategies
        (id, strategy_version, summary, current_phase, priorities_json,
         deprioritized_areas_json, active_hypotheses_json, near_term_objectives_json,
         upcoming_plan_json, concerns_json, last_reviewed_at, created_at, updated_at)
      VALUES (
        'initial-curriculum-strategy',
        1,
        'Establish and continuously refine a rigorous AI/ML mastery curriculum.',
        'Establish and continuously refine a rigorous AI/ML mastery curriculum.',
        '[]', '[]', '[]', '[]', '[]', '[]',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    `,
  },
];
