-- Rollback: drop messaging tables and related objects if they exist.
-- Run this if you previously applied 032_create_messages.sql and want to remove messaging.

DROP TRIGGER IF EXISTS trigger_update_messages_updated_at ON messages;
DROP TRIGGER IF EXISTS trigger_set_message_expiration ON messages;

DROP TABLE IF EXISTS message_read_receipts;
DROP TABLE IF EXISTS message_reactions;
DROP TABLE IF EXISTS message_edit_history;
DROP TABLE IF EXISTS message_deletion_log;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS typing_indicators;
DROP TABLE IF EXISTS encryption_keys;
DROP TABLE IF EXISTS legal_request_audit;

DROP FUNCTION IF EXISTS set_message_expiration();
DROP FUNCTION IF EXISTS update_messages_updated_at();
DROP FUNCTION IF EXISTS cleanup_expired_messages();
DROP FUNCTION IF EXISTS cleanup_typing_indicators();
