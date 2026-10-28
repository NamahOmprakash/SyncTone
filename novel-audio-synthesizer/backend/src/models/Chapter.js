/**
 * SyncTone — MongoDB / Mongoose Chapter Document Model
 *
 * Stores raw chapter text, dialogue segments with timing offsets, and
 * derived playback manifests, referenced to PostgreSQL via `pg_chapter_id`.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ==============================================================================
// 1. Subdocument Schemas
// ==============================================================================

const SegmentSchema = new Schema(
  {
    order: {
      type: Number,
      required: [true, 'Segment order is required'],
      min: [1, 'Segment order must be >= 1'],
    },
    segment_id: {
      type: Number,
      default: function () {
        return this.order;
      },
    },
    type: {
      type: String,
      enum: ['narration', 'dialogue', 'image'],
      required: [true, 'Segment type must be either narration, dialogue, or image'],
    },
    text: {
      type: String,
      required: [true, 'Segment text content is required'],
      trim: true,
      alias: 'text_content',
    },
    image_url: {
      type: String,
      default: null,
    },
    character_id: {
      type: String,
      default: null,
      trim: true,
    },
    speaker_id: {
      type: String,
      default: function () {
        return this.character_id;
      },
    },
    speaker_name: {
      type: String,
      default: null,
    },
    voice_id: {
      type: String,
      required: [true, 'Voice ID is required for audio playback synthesis'],
      trim: true,
    },
    assigned_voice_id: {
      type: String,
      default: function () {
        return this.voice_id;
      },
    },
    start_ms: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    end_ms: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    text_hash: {
      type: String,
      default: '',
      trim: true,
    },
    voice_hash: {
      type: String,
      default: '',
      trim: true,
    },
    confidence: {
      type: Number,
      default: 1.0,
      min: 0.0,
      max: 1.0,
      alias: 'confidence_score',
    },
    source: {
      type: String,
      enum: ['regex_rule', 'dependency_tree', 'llm_fallback', 'narrator_default', 'manual', 'unresolved', 'image'],
      default: 'narrator_default',
      alias: 'attribution_source',
    },
    needs_review: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const TimelineEntrySchema = new Schema(
  {
    order: { type: Number, required: true },
    segment_id: { type: Number, default: function () { return this.order; } },
    start_ms: { type: Number, required: true },
    end_ms: { type: Number, required: true },
    character_id: { type: String, default: null },
    voice_id: { type: String, required: true },
    text: { type: String, default: '' },
    type: { type: String, default: 'narration' },
    image_url: { type: String, default: null },
  },
  { _id: false }
);

const PlaybackManifestSchema = new Schema(
  {
    total_duration_ms: { type: Number, default: 0, min: 0 },
    audio_url: { type: String, default: '' },
    timeline: { type: [TimelineEntrySchema], default: [] },
  },
  { _id: false }
);

// ==============================================================================
// 2. Root Chapter Document Schema
// ==============================================================================

const ChapterSchema = new Schema(
  {
    pg_chapter_id: {
      type: String,
      required: [true, 'PostgreSQL chapter UUID reference is required'],
      unique: true,
      trim: true,
      index: true,
    },
    novel_id: {
      type: String,
      required: [true, 'PostgreSQL novel UUID reference is required'],
      trim: true,
      index: true,
    },
    chapter_number: {
      type: Number,
      required: [true, 'Chapter number is required'],
      min: [1, 'Chapter number must be greater than 0'],
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    raw_text: {
      type: String,
      required: [true, 'Raw chapter text is required'],
    },
    audio_version: {
      type: Number,
      default: 1,
      min: 1,
    },
    manifest: {
      type: PlaybackManifestSchema,
      default: () => ({ total_duration_ms: 0, timeline: [] }),
    },
    segments: {
      type: [SegmentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'chapters',
  }
);

// Compound unique index ensuring no duplicate chapter numbers within the same novel
ChapterSchema.index({ novel_id: 1, chapter_number: 1 }, { unique: true });

// ==============================================================================
// 3. Model Export
// ==============================================================================

const Chapter = mongoose.models.Chapter || mongoose.model('Chapter', ChapterSchema);

module.exports = Chapter;
module.exports.Chapter = Chapter;
module.exports.default = Chapter;
