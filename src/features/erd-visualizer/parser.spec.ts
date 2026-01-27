import { parseSchemaFromText } from './parser';

// simple tests that can be run with vitest
const exampleSql = `
CREATE TABLE users (
  id serial primary key,
  email varchar(255) not null
);

CREATE TABLE orders (
  id serial primary key,
  user_id integer,
  product varchar(255),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

const model = parseSchemaFromText(exampleSql);

if (model.entities.length !== 2) {
  throw new Error('expected 2 entities');
}

const users = model.entities.find(e => e.name === 'users');
if (!users) throw new Error('users table not found');
const orders = model.entities.find(e => e.name === 'orders');
if (!orders) throw new Error('orders table not found');

if (model.relationships.length < 1) throw new Error('expected at least 1 relationship');

console.log('parser.spec ran OK');

// JSON canonical shape test
const exampleJson = JSON.stringify({
  entities: [
    { name: 'users', columns: [{ name: 'id', primary: true }, { name: 'email' }] },
    { name: 'orders', columns: [{ name: 'id', primary: true }, { name: 'user_id' }] }
  ],
  relationships: [{ from: 'orders.user_id', to: 'users.id', cardinality: 'many-to-one' }]
});

const jsonModel = parseSchemaFromText(exampleJson);
if (jsonModel.entities.length !== 2) throw new Error('expected 2 entities from JSON');
if (jsonModel.relationships.length !== 1) throw new Error('expected 1 relationship from JSON');
console.log('parser.json test OK');

// Databricks/Spark SQL test with complex types (ARRAY, MAP) and USING DELTA
const databricksSql = `
CREATE TABLE IF NOT EXISTS demo_insurance_master (
  person_id STRING NOT NULL,  -- e.g. 'p-0001'
  policy_number STRING NOT NULL,
  nominee_1_name STRING,
  nominee_1_relationship STRING,
  nominee_1_percentage DOUBLE,
  rider_details MAP<STRING,STRING>, -- e.g. {'rider_name':'<>', 'u i n':'<>', 'sum_assured':'<>'}
  policy_status STRING,  -- Active / Lapsed / Paid-up / Cancelled (demo)
  CONSTRAINT pk_insurance_master PRIMARY KEY (person_id, policy_number)
)
USING DELTA;

-- Claims table - demo version
CREATE TABLE IF NOT EXISTS demo_insurance_claims (
  claim_id STRING NOT NULL,  -- e.g. 'c-0001'
  person_id STRING NOT NULL,  -- FK to demo_insurance_master.person_id
  policy_number STRING NOT NULL,
  claim_date DATE,
  incident_date DATE,
  claim_type STRING,  -- hospitalization / death / maternity / surrender / loan
  provider_name STRING,
  invoice_id STRING,
  documents_submitted ARRAY<STRING>, -- list e.g. ['claim_form','death_certificate','policy_copy']
  missing_documents_flag INT, -- 0/1
  claim_amount_requested DOUBLE,
  claim_amount_approved DOUBLE,
  claim_status STRING,  -- Pending / Partially Approved / Approved / Rejected
  denial_reasons ARRAY<STRING>  -- e.g. ['waiting_period_not_met','suicide_within_1_year']
)
USING DELTA;
`;

const databricksModel = parseSchemaFromText(databricksSql);

if (databricksModel.entities.length !== 2) {
  throw new Error(`Databricks: expected 2 entities, got ${databricksModel.entities.length}`);
}

const insuranceMaster = databricksModel.entities.find(e => e.name === 'demo_insurance_master');
if (!insuranceMaster) throw new Error('demo_insurance_master table not found');

const insuranceClaims = databricksModel.entities.find(e => e.name === 'demo_insurance_claims');
if (!insuranceClaims) throw new Error('demo_insurance_claims table not found');

// Verify complex types are parsed correctly
const riderDetails = insuranceMaster.columns.find(c => c.name === 'rider_details');
if (!riderDetails) throw new Error('rider_details column not found');
if (!riderDetails.type?.includes('MAP')) throw new Error(`rider_details type should contain MAP, got: ${riderDetails.type}`);

const documentsSubmitted = insuranceClaims.columns.find(c => c.name === 'documents_submitted');
if (!documentsSubmitted) throw new Error('documents_submitted column not found');
if (!documentsSubmitted.type?.includes('ARRAY')) throw new Error(`documents_submitted type should contain ARRAY, got: ${documentsSubmitted.type}`);

// Verify primary key columns are detected
const personIdPk = insuranceMaster.columns.find(c => c.name === 'person_id');
const policyNumberPk = insuranceMaster.columns.find(c => c.name === 'policy_number');
if (!personIdPk?.primary || !policyNumberPk?.primary) {
  throw new Error('Primary key columns not detected correctly');
}

console.log('parser.databricks test OK');
