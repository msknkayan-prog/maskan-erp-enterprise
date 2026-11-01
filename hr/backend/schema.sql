CREATE SCHEMA IF NOT EXISTS hr; REVOKE ALL ON SCHEMA hr FROM PUBLIC,anon,authenticated;
CREATE TABLE hr.audit (
	id text PRIMARY KEY NOT NULL,
	actor text NOT NULL,
	record_id text NOT NULL,
	action text NOT NULL,
	at text NOT NULL,
	details text NOT NULL
);

CREATE TABLE hr.members (
	email text PRIMARY KEY NOT NULL,
	role text NOT NULL
);

CREATE TABLE hr.records (
	id text PRIMARY KEY NOT NULL,
	module text NOT NULL,
	company text NOT NULL,
	code text,
	data text NOT NULL,
	status text DEFAULT 'draft' NOT NULL,
	revision integer DEFAULT 1 NOT NULL,
	created_by text NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL
);

CREATE INDEX record_scope ON hr.records (company,module);
CREATE UNIQUE INDEX module_code ON hr.records (module,code);
CREATE TABLE hr.workspace (
	id text PRIMARY KEY NOT NULL,
	owner text NOT NULL
);

ALTER TABLE hr.records ADD mutation text DEFAULT '' NOT NULL;
CREATE TABLE hr.attendance (
	id text PRIMARY KEY NOT NULL,
	employee_id text NOT NULL,
	company text NOT NULL,
	project_id text NOT NULL,
	check_in text NOT NULL,
	check_out text,
	tracking integer DEFAULT 1 NOT NULL,
	consent_at text NOT NULL,
	open_key text
);

CREATE UNIQUE INDEX attendance_open_key_unique ON hr.attendance (open_key);
CREATE TABLE hr.files (
	id text PRIMARY KEY NOT NULL,
	record_id text NOT NULL,
	name text NOT NULL,
	key text NOT NULL,
	mime text NOT NULL,
	size integer NOT NULL,
	sha text NOT NULL,
	actor text NOT NULL,
	at text NOT NULL
);

CREATE TABLE hr.legacy (
	id text PRIMARY KEY NOT NULL,
	source text NOT NULL,
	table_name text NOT NULL,
	payload text NOT NULL
);

CREATE TABLE hr.locations (
	id text PRIMARY KEY NOT NULL,
	session_id text NOT NULL,
	at text NOT NULL,
	latitude text NOT NULL,
	longitude text NOT NULL,
	accuracy text NOT NULL,
	distance text NOT NULL,
	event text NOT NULL
);

CREATE TABLE hr.imports (
	id text PRIMARY KEY NOT NULL,
	source text NOT NULL,
	summary text NOT NULL,
	at text NOT NULL
);

ALTER TABLE hr.members ADD employee_id text;
ALTER TABLE hr.members ADD companies text DEFAULT '*' NOT NULL;
ALTER TABLE hr.members ADD projects text DEFAULT '*' NOT NULL;
ALTER TABLE hr.members ADD permissions text DEFAULT '{}' NOT NULL;
CREATE TABLE hr.blobs(key text primary key,bytes bytea not null);
ALTER TABLE hr.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.audit FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.members FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.records FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.workspace ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.workspace FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.attendance FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.files FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.legacy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.legacy FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.locations FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.imports FROM PUBLIC,anon,authenticated;
ALTER TABLE hr.blobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hr.blobs FROM PUBLIC,anon,authenticated;
-- Administrator membership is provisioned separately.
CREATE FUNCTION hr.repayment_limit() RETURNS trigger LANGUAGE plpgsql SET search_path=hr,pg_catalog AS $$
DECLARE principal numeric; paid numeric;
BEGIN
 IF NEW.module <> 'repayments' THEN RETURN NEW; END IF;
 SELECT (data::jsonb->>'amount')::numeric INTO principal FROM hr.records WHERE id=NEW.data::jsonb->>'advance_id' AND module='advances' FOR UPDATE;
 IF principal IS NULL THEN RAISE EXCEPTION 'advance missing'; END IF;
 SELECT coalesce(sum((data::jsonb->>'amount')::numeric),0) INTO paid FROM hr.records WHERE module='repayments' AND id<>NEW.id AND data::jsonb->>'advance_id'=NEW.data::jsonb->>'advance_id';
 IF (NEW.data::jsonb->>'amount')::numeric < 0 OR paid+(NEW.data::jsonb->>'amount')::numeric>principal+0.001 THEN RAISE EXCEPTION 'repayment exceeds outstanding'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hr.repayment_limit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER repayment_limit BEFORE INSERT OR UPDATE OF data ON hr.records FOR EACH ROW EXECUTE FUNCTION hr.repayment_limit();
