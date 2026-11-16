CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- The application must never connect as the database owner (RLS bypass).
CREATE ROLE markup_app LOGIN PASSWORD 'local-development-only' NOSUPERUSER NOBYPASSRLS;
CREATE TABLE tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 parent_id uuid, name varchar(120) NOT NULL, kind varchar(30) NOT NULL,
 reported jsonb NOT NULL DEFAULT '{}', desired jsonb NOT NULL DEFAULT '{}', last_seen timestamptz,
 UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id,parent_id) REFERENCES assets(tenant_id,id), CHECK(parent_id <> id)
);
CREATE TABLE telemetry (
 tenant_id uuid NOT NULL, device_id uuid NOT NULL, timestamp timestamptz NOT NULL,
 metrics jsonb NOT NULL, PRIMARY KEY(device_id,timestamp),
 FOREIGN KEY (tenant_id,device_id) REFERENCES assets(tenant_id,id)
);
SELECT create_hypertable('telemetry','timestamp');
CREATE INDEX ON telemetry (tenant_id,device_id,timestamp DESC);
CREATE TABLE alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
 device_id uuid NOT NULL,metric varchar(100) NOT NULL,value double precision NOT NULL,
 severity varchar(20) NOT NULL,status varchar(20) NOT NULL DEFAULT 'open',created_at timestamptz NOT NULL,note text,
 FOREIGN KEY (tenant_id,device_id) REFERENCES assets(tenant_id,id)
);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL,
 actor text NOT NULL, action text NOT NULL, entity text NOT NULL,
 before_state jsonb, after_state jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['assets','telemetry','alerts','audit_logs'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',tbl);
 END LOOP;
END $$;
CREATE FUNCTION record_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO audit_logs(tenant_id,actor,action,entity,before_state,after_state)
 VALUES(COALESCE(NEW.tenant_id,OLD.tenant_id),COALESCE(current_setting('app.actor',true),'system'),TG_OP,TG_TABLE_NAME,
 CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER assets_audit AFTER INSERT OR UPDATE OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION record_audit();
CREATE TRIGGER alerts_audit AFTER INSERT OR UPDATE OR DELETE ON alerts FOR EACH ROW EXECUTE FUNCTION record_audit();
CREATE FUNCTION immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit log is append-only'; END $$;
CREATE TRIGGER no_audit_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION immutable_audit();
GRANT USAGE ON SCHEMA public TO markup_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON assets,telemetry,alerts TO markup_app;
GRANT SELECT ON audit_logs TO markup_app;
INSERT INTO tenants(id,name) VALUES('11111111-1111-4111-8111-111111111111','Markup Enterprise');
