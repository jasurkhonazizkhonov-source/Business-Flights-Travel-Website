// GENERATED FILE — do not edit by hand. Run `npm run bundle:schema-shape`.
// Source: the real 54 migrations (prisma/migrations), introspected via PostgreSQL's own
// catalog after applying them to a disposable engine. See scripts/generate-schema-shape.mjs.
export interface AddConstraint {
  name: string;
  sql: string;
}
export interface ColumnShape {
  name: string;
  type: string;
  notNull: boolean;
}
export interface SequenceShape {
  column: string;
  name: string;
  createSequence: string;
  setDefault: string;
  setOwnership: string;
}
export interface TableShape {
  columns: ColumnShape[];
  createTable: string;
  sequences: SequenceShape[];
  primaryKey: AddConstraint | null;
  uniqueConstraints: AddConstraint[];
  indexes: string[];
  foreignKeys: AddConstraint[];
}

export const SCHEMA_SHAPE: Readonly<Record<string, TableShape>> = {
  "Company": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "name",
        "type": "text",
        "notNull": true
      },
      {
        "name": "website",
        "type": "text",
        "notNull": false
      },
      {
        "name": "phone",
        "type": "text",
        "notNull": false
      },
      {
        "name": "brandColor",
        "type": "text",
        "notNull": false
      },
      {
        "name": "logoOriginalUrl",
        "type": "text",
        "notNull": false
      },
      {
        "name": "logoEmailUrl",
        "type": "text",
        "notNull": false
      },
      {
        "name": "logoWebUrl",
        "type": "text",
        "notNull": false
      },
      {
        "name": "logoIconUrl",
        "type": "text",
        "notNull": false
      },
      {
        "name": "logoProcessingStatus",
        "type": "\"LogoProcessingStatus\"",
        "notNull": true
      },
      {
        "name": "logoProcessingError",
        "type": "text",
        "notNull": false
      },
      {
        "name": "signatureTemplate",
        "type": "text",
        "notNull": true
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "updatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "logoEmailData",
        "type": "bytea",
        "notNull": false
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Company\" (\n  \"id\" text NOT NULL,\n  \"name\" text NOT NULL,\n  \"website\" text,\n  \"phone\" text,\n  \"brandColor\" text,\n  \"logoOriginalUrl\" text,\n  \"logoEmailUrl\" text,\n  \"logoWebUrl\" text,\n  \"logoIconUrl\" text,\n  \"logoProcessingStatus\" \"LogoProcessingStatus\" NOT NULL DEFAULT 'NONE'::\"LogoProcessingStatus\",\n  \"logoProcessingError\" text,\n  \"signatureTemplate\" text NOT NULL,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"updatedAt\" timestamp(3) without time zone NOT NULL,\n  \"logoEmailData\" bytea\n)",
    "sequences": [],
    "primaryKey": {
      "name": "Company_pkey",
      "sql": "ALTER TABLE \"Company\" ADD CONSTRAINT \"Company_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [],
    "foreignKeys": []
  },
  "Account": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "fullName",
        "type": "text",
        "notNull": true
      },
      {
        "name": "email",
        "type": "text",
        "notNull": true
      },
      {
        "name": "phone",
        "type": "text",
        "notNull": false
      },
      {
        "name": "role",
        "type": "\"AccountRole\"",
        "notNull": true
      },
      {
        "name": "status",
        "type": "\"AccountStatus\"",
        "notNull": true
      },
      {
        "name": "avatarUrl",
        "type": "text",
        "notNull": false
      },
      {
        "name": "lastSeenAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "updatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "hiredAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "paymentPermissions",
        "type": "text[]",
        "notNull": false
      },
      {
        "name": "bookingPermissions",
        "type": "text[]",
        "notNull": false
      },
      {
        "name": "activeSessionId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "sessionCreatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "companyId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "location",
        "type": "text",
        "notNull": false
      },
      {
        "name": "commissionPercent",
        "type": "numeric(5,2)",
        "notNull": false
      },
      {
        "name": "tipPercent",
        "type": "numeric(5,2)",
        "notNull": false
      },
      {
        "name": "accountsVisible",
        "type": "boolean",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Account\" (\n  \"id\" text NOT NULL,\n  \"fullName\" text NOT NULL,\n  \"email\" text NOT NULL,\n  \"phone\" text,\n  \"role\" \"AccountRole\" NOT NULL DEFAULT 'TRAVEL_AGENT'::\"AccountRole\",\n  \"status\" \"AccountStatus\" NOT NULL DEFAULT 'ACTIVE'::\"AccountStatus\",\n  \"avatarUrl\" text,\n  \"lastSeenAt\" timestamp(3) without time zone,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"updatedAt\" timestamp(3) without time zone NOT NULL,\n  \"hiredAt\" timestamp(3) without time zone,\n  \"paymentPermissions\" text[] DEFAULT ARRAY[]::text[],\n  \"bookingPermissions\" text[] DEFAULT ARRAY[]::text[],\n  \"activeSessionId\" text,\n  \"sessionCreatedAt\" timestamp(3) without time zone,\n  \"companyId\" text NOT NULL,\n  \"location\" text,\n  \"commissionPercent\" numeric(5,2),\n  \"tipPercent\" numeric(5,2),\n  \"accountsVisible\" boolean NOT NULL DEFAULT true\n)",
    "sequences": [],
    "primaryKey": {
      "name": "Account_pkey",
      "sql": "ALTER TABLE \"Account\" ADD CONSTRAINT \"Account_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE UNIQUE INDEX \"Account_activeSessionId_key\" ON public.\"Account\" USING btree (\"activeSessionId\");",
      "CREATE INDEX \"Account_companyId_idx\" ON public.\"Account\" USING btree (\"companyId\");",
      "CREATE UNIQUE INDEX \"Account_email_key\" ON public.\"Account\" USING btree (email);",
      "CREATE INDEX \"Account_role_idx\" ON public.\"Account\" USING btree (role);",
      "CREATE INDEX \"Account_status_idx\" ON public.\"Account\" USING btree (status);"
    ],
    "foreignKeys": [
      {
        "name": "Account_companyId_fkey",
        "sql": "ALTER TABLE \"Account\" ADD CONSTRAINT \"Account_companyId_fkey\" FOREIGN KEY (\"companyId\") REFERENCES \"Company\"(id) ON UPDATE CASCADE ON DELETE RESTRICT;"
      }
    ]
  },
  "Contact": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "firstName",
        "type": "text",
        "notNull": true
      },
      {
        "name": "middleName",
        "type": "text",
        "notNull": false
      },
      {
        "name": "lastName",
        "type": "text",
        "notNull": true
      },
      {
        "name": "primaryPhone",
        "type": "text",
        "notNull": false
      },
      {
        "name": "primaryEmail",
        "type": "text",
        "notNull": false
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "updatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "ownerId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "companyId",
        "type": "text",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Contact\" (\n  \"id\" text NOT NULL,\n  \"firstName\" text NOT NULL,\n  \"middleName\" text,\n  \"lastName\" text NOT NULL,\n  \"primaryPhone\" text,\n  \"primaryEmail\" text,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"updatedAt\" timestamp(3) without time zone NOT NULL,\n  \"ownerId\" text,\n  \"companyId\" text NOT NULL\n)",
    "sequences": [],
    "primaryKey": {
      "name": "Contact_pkey",
      "sql": "ALTER TABLE \"Contact\" ADD CONSTRAINT \"Contact_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"Contact_companyId_idx\" ON public.\"Contact\" USING btree (\"companyId\");",
      "CREATE INDEX \"Contact_lastName_firstName_idx\" ON public.\"Contact\" USING btree (\"lastName\", \"firstName\");",
      "CREATE INDEX \"Contact_ownerId_idx\" ON public.\"Contact\" USING btree (\"ownerId\");",
      "CREATE INDEX \"Contact_primaryEmail_idx\" ON public.\"Contact\" USING btree (\"primaryEmail\");",
      "CREATE INDEX \"Contact_primaryPhone_idx\" ON public.\"Contact\" USING btree (\"primaryPhone\");",
      "CREATE INDEX \"Contact_updatedAt_idx\" ON public.\"Contact\" USING btree (\"updatedAt\");"
    ],
    "foreignKeys": [
      {
        "name": "Contact_companyId_fkey",
        "sql": "ALTER TABLE \"Contact\" ADD CONSTRAINT \"Contact_companyId_fkey\" FOREIGN KEY (\"companyId\") REFERENCES \"Company\"(id) ON UPDATE CASCADE ON DELETE RESTRICT;"
      },
      {
        "name": "Contact_ownerId_fkey",
        "sql": "ALTER TABLE \"Contact\" ADD CONSTRAINT \"Contact_ownerId_fkey\" FOREIGN KEY (\"ownerId\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      }
    ]
  },
  "ContactEmail": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "contactId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "email",
        "type": "text",
        "notNull": true
      },
      {
        "name": "type",
        "type": "\"ContactEmailType\"",
        "notNull": true
      },
      {
        "name": "isPrimary",
        "type": "boolean",
        "notNull": true
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"ContactEmail\" (\n  \"id\" text NOT NULL,\n  \"contactId\" text NOT NULL,\n  \"email\" text NOT NULL,\n  \"type\" \"ContactEmailType\" NOT NULL DEFAULT 'PERSONAL'::\"ContactEmailType\",\n  \"isPrimary\" boolean NOT NULL DEFAULT false,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP\n)",
    "sequences": [],
    "primaryKey": {
      "name": "ContactEmail_pkey",
      "sql": "ALTER TABLE \"ContactEmail\" ADD CONSTRAINT \"ContactEmail_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"ContactEmail_contactId_idx\" ON public.\"ContactEmail\" USING btree (\"contactId\");",
      "CREATE INDEX \"ContactEmail_email_idx\" ON public.\"ContactEmail\" USING btree (email);"
    ],
    "foreignKeys": [
      {
        "name": "ContactEmail_contactId_fkey",
        "sql": "ALTER TABLE \"ContactEmail\" ADD CONSTRAINT \"ContactEmail_contactId_fkey\" FOREIGN KEY (\"contactId\") REFERENCES \"Contact\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      }
    ]
  },
  "ContactPhone": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "contactId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "number",
        "type": "text",
        "notNull": true
      },
      {
        "name": "type",
        "type": "\"PhoneType\"",
        "notNull": true
      },
      {
        "name": "isPrimary",
        "type": "boolean",
        "notNull": true
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"ContactPhone\" (\n  \"id\" text NOT NULL,\n  \"contactId\" text NOT NULL,\n  \"number\" text NOT NULL,\n  \"type\" \"PhoneType\" NOT NULL DEFAULT 'MOBILE'::\"PhoneType\",\n  \"isPrimary\" boolean NOT NULL DEFAULT false,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP\n)",
    "sequences": [],
    "primaryKey": {
      "name": "ContactPhone_pkey",
      "sql": "ALTER TABLE \"ContactPhone\" ADD CONSTRAINT \"ContactPhone_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"ContactPhone_contactId_idx\" ON public.\"ContactPhone\" USING btree (\"contactId\");",
      "CREATE INDEX \"ContactPhone_number_idx\" ON public.\"ContactPhone\" USING btree (number);"
    ],
    "foreignKeys": [
      {
        "name": "ContactPhone_contactId_fkey",
        "sql": "ALTER TABLE \"ContactPhone\" ADD CONSTRAINT \"ContactPhone_contactId_fkey\" FOREIGN KEY (\"contactId\") REFERENCES \"Contact\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      }
    ]
  },
  "ContactInquiry": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "companyId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "firstName",
        "type": "text",
        "notNull": true
      },
      {
        "name": "lastName",
        "type": "text",
        "notNull": true
      },
      {
        "name": "email",
        "type": "text",
        "notNull": true
      },
      {
        "name": "phone",
        "type": "text",
        "notNull": false
      },
      {
        "name": "subject",
        "type": "\"InquirySubject\"",
        "notNull": true
      },
      {
        "name": "message",
        "type": "text",
        "notNull": true
      },
      {
        "name": "status",
        "type": "\"InquiryStatus\"",
        "notNull": true
      },
      {
        "name": "assignedAdminId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "readAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "matchedContactId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "updatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"ContactInquiry\" (\n  \"id\" text NOT NULL,\n  \"companyId\" text NOT NULL,\n  \"firstName\" text NOT NULL,\n  \"lastName\" text NOT NULL,\n  \"email\" text NOT NULL,\n  \"phone\" text,\n  \"subject\" \"InquirySubject\" NOT NULL,\n  \"message\" text NOT NULL,\n  \"status\" \"InquiryStatus\" NOT NULL DEFAULT 'NEW'::\"InquiryStatus\",\n  \"assignedAdminId\" text,\n  \"readAt\" timestamp(3) without time zone,\n  \"matchedContactId\" text,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"updatedAt\" timestamp(3) without time zone NOT NULL\n)",
    "sequences": [],
    "primaryKey": {
      "name": "ContactInquiry_pkey",
      "sql": "ALTER TABLE \"ContactInquiry\" ADD CONSTRAINT \"ContactInquiry_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"ContactInquiry_companyId_idx\" ON public.\"ContactInquiry\" USING btree (\"companyId\");",
      "CREATE INDEX \"ContactInquiry_matchedContactId_idx\" ON public.\"ContactInquiry\" USING btree (\"matchedContactId\");",
      "CREATE INDEX \"ContactInquiry_status_idx\" ON public.\"ContactInquiry\" USING btree (status);"
    ],
    "foreignKeys": [
      {
        "name": "ContactInquiry_assignedAdminId_fkey",
        "sql": "ALTER TABLE \"ContactInquiry\" ADD CONSTRAINT \"ContactInquiry_assignedAdminId_fkey\" FOREIGN KEY (\"assignedAdminId\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      },
      {
        "name": "ContactInquiry_companyId_fkey",
        "sql": "ALTER TABLE \"ContactInquiry\" ADD CONSTRAINT \"ContactInquiry_companyId_fkey\" FOREIGN KEY (\"companyId\") REFERENCES \"Company\"(id) ON UPDATE CASCADE ON DELETE RESTRICT;"
      },
      {
        "name": "ContactInquiry_matchedContactId_fkey",
        "sql": "ALTER TABLE \"ContactInquiry\" ADD CONSTRAINT \"ContactInquiry_matchedContactId_fkey\" FOREIGN KEY (\"matchedContactId\") REFERENCES \"Contact\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      }
    ]
  },
  "Lead": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "contactId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "departureAirportId",
        "type": "integer",
        "notNull": false
      },
      {
        "name": "arrivalAirportId",
        "type": "integer",
        "notNull": false
      },
      {
        "name": "departureDate",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "returnDate",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "tripType",
        "type": "\"TripType\"",
        "notNull": true
      },
      {
        "name": "cabinClass",
        "type": "\"CabinClass\"",
        "notNull": true
      },
      {
        "name": "adults",
        "type": "integer",
        "notNull": true
      },
      {
        "name": "children",
        "type": "integer",
        "notNull": true
      },
      {
        "name": "infants",
        "type": "integer",
        "notNull": true
      },
      {
        "name": "flexibleDates",
        "type": "boolean",
        "notNull": true
      },
      {
        "name": "preferredAirline",
        "type": "text",
        "notNull": false
      },
      {
        "name": "budget",
        "type": "numeric(10,2)",
        "notNull": false
      },
      {
        "name": "notes",
        "type": "text",
        "notNull": false
      },
      {
        "name": "status",
        "type": "\"LeadStatus\"",
        "notNull": true
      },
      {
        "name": "source",
        "type": "\"LeadSource\"",
        "notNull": true
      },
      {
        "name": "priority",
        "type": "\"Priority\"",
        "notNull": true
      },
      {
        "name": "assignedAgentId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "updatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "queueDistributedAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "referredByContactId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "offeredToId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "offeredAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "offerExpiresAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Lead\" (\n  \"id\" text NOT NULL,\n  \"contactId\" text NOT NULL,\n  \"departureAirportId\" integer,\n  \"arrivalAirportId\" integer,\n  \"departureDate\" timestamp(3) without time zone,\n  \"returnDate\" timestamp(3) without time zone,\n  \"tripType\" \"TripType\" NOT NULL DEFAULT 'ROUND_TRIP'::\"TripType\",\n  \"cabinClass\" \"CabinClass\" NOT NULL DEFAULT 'ECONOMY'::\"CabinClass\",\n  \"adults\" integer NOT NULL DEFAULT 1,\n  \"children\" integer NOT NULL DEFAULT 0,\n  \"infants\" integer NOT NULL DEFAULT 0,\n  \"flexibleDates\" boolean NOT NULL DEFAULT false,\n  \"preferredAirline\" text,\n  \"budget\" numeric(10,2),\n  \"notes\" text,\n  \"status\" \"LeadStatus\" NOT NULL DEFAULT 'ATTEMPTING_TO_CONTACT'::\"LeadStatus\",\n  \"source\" \"LeadSource\" NOT NULL DEFAULT 'WEBSITE'::\"LeadSource\",\n  \"priority\" \"Priority\" NOT NULL DEFAULT 'MEDIUM'::\"Priority\",\n  \"assignedAgentId\" text,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"updatedAt\" timestamp(3) without time zone NOT NULL,\n  \"queueDistributedAt\" timestamp(3) without time zone,\n  \"referredByContactId\" text,\n  \"offeredToId\" text,\n  \"offeredAt\" timestamp(3) without time zone,\n  \"offerExpiresAt\" timestamp(3) without time zone\n)",
    "sequences": [],
    "primaryKey": {
      "name": "Lead_pkey",
      "sql": "ALTER TABLE \"Lead\" ADD CONSTRAINT \"Lead_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"Lead_assignedAgentId_idx\" ON public.\"Lead\" USING btree (\"assignedAgentId\");",
      "CREATE INDEX \"Lead_cabinClass_idx\" ON public.\"Lead\" USING btree (\"cabinClass\");",
      "CREATE INDEX \"Lead_contactId_idx\" ON public.\"Lead\" USING btree (\"contactId\");",
      "CREATE INDEX \"Lead_createdAt_idx\" ON public.\"Lead\" USING btree (\"createdAt\");",
      "CREATE INDEX \"Lead_offeredToId_idx\" ON public.\"Lead\" USING btree (\"offeredToId\");",
      "CREATE INDEX \"Lead_referredByContactId_idx\" ON public.\"Lead\" USING btree (\"referredByContactId\");",
      "CREATE INDEX \"Lead_source_assignedAgentId_queueDistributedAt_idx\" ON public.\"Lead\" USING btree (source, \"assignedAgentId\", \"queueDistributedAt\");",
      "CREATE INDEX \"Lead_source_idx\" ON public.\"Lead\" USING btree (source);",
      "CREATE INDEX \"Lead_status_idx\" ON public.\"Lead\" USING btree (status);",
      "CREATE INDEX \"Lead_tripType_idx\" ON public.\"Lead\" USING btree (\"tripType\");",
      "CREATE INDEX \"Lead_updatedAt_idx\" ON public.\"Lead\" USING btree (\"updatedAt\");"
    ],
    "foreignKeys": [
      {
        "name": "Lead_departureAirportId_fkey",
        "sql": "ALTER TABLE \"Lead\" ADD CONSTRAINT \"Lead_departureAirportId_fkey\" FOREIGN KEY (\"departureAirportId\") REFERENCES \"Airport\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      },
      {
        "name": "Lead_assignedAgentId_fkey",
        "sql": "ALTER TABLE \"Lead\" ADD CONSTRAINT \"Lead_assignedAgentId_fkey\" FOREIGN KEY (\"assignedAgentId\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      },
      {
        "name": "Lead_contactId_fkey",
        "sql": "ALTER TABLE \"Lead\" ADD CONSTRAINT \"Lead_contactId_fkey\" FOREIGN KEY (\"contactId\") REFERENCES \"Contact\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Lead_arrivalAirportId_fkey",
        "sql": "ALTER TABLE \"Lead\" ADD CONSTRAINT \"Lead_arrivalAirportId_fkey\" FOREIGN KEY (\"arrivalAirportId\") REFERENCES \"Airport\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      },
      {
        "name": "Lead_offeredToId_fkey",
        "sql": "ALTER TABLE \"Lead\" ADD CONSTRAINT \"Lead_offeredToId_fkey\" FOREIGN KEY (\"offeredToId\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      },
      {
        "name": "Lead_referredByContactId_fkey",
        "sql": "ALTER TABLE \"Lead\" ADD CONSTRAINT \"Lead_referredByContactId_fkey\" FOREIGN KEY (\"referredByContactId\") REFERENCES \"Contact\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      }
    ]
  },
  "LeadStatusHistory": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "leadId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "fromStatus",
        "type": "\"LeadStatus\"",
        "notNull": false
      },
      {
        "name": "toStatus",
        "type": "\"LeadStatus\"",
        "notNull": true
      },
      {
        "name": "changedById",
        "type": "text",
        "notNull": false
      },
      {
        "name": "note",
        "type": "text",
        "notNull": false
      },
      {
        "name": "changedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"LeadStatusHistory\" (\n  \"id\" text NOT NULL,\n  \"leadId\" text NOT NULL,\n  \"fromStatus\" \"LeadStatus\",\n  \"toStatus\" \"LeadStatus\" NOT NULL,\n  \"changedById\" text,\n  \"note\" text,\n  \"changedAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP\n)",
    "sequences": [],
    "primaryKey": {
      "name": "LeadStatusHistory_pkey",
      "sql": "ALTER TABLE \"LeadStatusHistory\" ADD CONSTRAINT \"LeadStatusHistory_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"LeadStatusHistory_leadId_idx\" ON public.\"LeadStatusHistory\" USING btree (\"leadId\");"
    ],
    "foreignKeys": [
      {
        "name": "LeadStatusHistory_changedById_fkey",
        "sql": "ALTER TABLE \"LeadStatusHistory\" ADD CONSTRAINT \"LeadStatusHistory_changedById_fkey\" FOREIGN KEY (\"changedById\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      },
      {
        "name": "LeadStatusHistory_leadId_fkey",
        "sql": "ALTER TABLE \"LeadStatusHistory\" ADD CONSTRAINT \"LeadStatusHistory_leadId_fkey\" FOREIGN KEY (\"leadId\") REFERENCES \"Lead\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      }
    ]
  },
  "LeadQueueEntry": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "accountId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "isActive",
        "type": "boolean",
        "notNull": true
      },
      {
        "name": "joinedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "lastAssignedAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "leadsAssignedCount",
        "type": "integer",
        "notNull": true
      },
      {
        "name": "updatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"LeadQueueEntry\" (\n  \"id\" text NOT NULL,\n  \"accountId\" text NOT NULL,\n  \"isActive\" boolean NOT NULL DEFAULT true,\n  \"joinedAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"lastAssignedAt\" timestamp(3) without time zone,\n  \"leadsAssignedCount\" integer NOT NULL DEFAULT 0,\n  \"updatedAt\" timestamp(3) without time zone NOT NULL\n)",
    "sequences": [],
    "primaryKey": {
      "name": "LeadQueueEntry_pkey",
      "sql": "ALTER TABLE \"LeadQueueEntry\" ADD CONSTRAINT \"LeadQueueEntry_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE UNIQUE INDEX \"LeadQueueEntry_accountId_key\" ON public.\"LeadQueueEntry\" USING btree (\"accountId\");",
      "CREATE INDEX \"LeadQueueEntry_isActive_idx\" ON public.\"LeadQueueEntry\" USING btree (\"isActive\");",
      "CREATE INDEX \"LeadQueueEntry_isActive_lastAssignedAt_idx\" ON public.\"LeadQueueEntry\" USING btree (\"isActive\", \"lastAssignedAt\");"
    ],
    "foreignKeys": [
      {
        "name": "LeadQueueEntry_accountId_fkey",
        "sql": "ALTER TABLE \"LeadQueueEntry\" ADD CONSTRAINT \"LeadQueueEntry_accountId_fkey\" FOREIGN KEY (\"accountId\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      }
    ]
  },
  "Activity": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "contactId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "leadId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "quoteId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "bookingId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "actorId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "type",
        "type": "text",
        "notNull": true
      },
      {
        "name": "description",
        "type": "text",
        "notNull": true
      },
      {
        "name": "metadata",
        "type": "jsonb",
        "notNull": false
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Activity\" (\n  \"id\" text NOT NULL,\n  \"contactId\" text,\n  \"leadId\" text,\n  \"quoteId\" text,\n  \"bookingId\" text,\n  \"actorId\" text,\n  \"type\" text NOT NULL,\n  \"description\" text NOT NULL,\n  \"metadata\" jsonb,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP\n)",
    "sequences": [],
    "primaryKey": {
      "name": "Activity_pkey",
      "sql": "ALTER TABLE \"Activity\" ADD CONSTRAINT \"Activity_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"Activity_bookingId_idx\" ON public.\"Activity\" USING btree (\"bookingId\");",
      "CREATE INDEX \"Activity_contactId_idx\" ON public.\"Activity\" USING btree (\"contactId\");",
      "CREATE INDEX \"Activity_createdAt_idx\" ON public.\"Activity\" USING btree (\"createdAt\");",
      "CREATE INDEX \"Activity_leadId_idx\" ON public.\"Activity\" USING btree (\"leadId\");",
      "CREATE INDEX \"Activity_quoteId_idx\" ON public.\"Activity\" USING btree (\"quoteId\");"
    ],
    "foreignKeys": [
      {
        "name": "Activity_actorId_fkey",
        "sql": "ALTER TABLE \"Activity\" ADD CONSTRAINT \"Activity_actorId_fkey\" FOREIGN KEY (\"actorId\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE SET NULL;"
      },
      {
        "name": "Activity_bookingId_fkey",
        "sql": "ALTER TABLE \"Activity\" ADD CONSTRAINT \"Activity_bookingId_fkey\" FOREIGN KEY (\"bookingId\") REFERENCES \"Booking\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Activity_contactId_fkey",
        "sql": "ALTER TABLE \"Activity\" ADD CONSTRAINT \"Activity_contactId_fkey\" FOREIGN KEY (\"contactId\") REFERENCES \"Contact\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Activity_leadId_fkey",
        "sql": "ALTER TABLE \"Activity\" ADD CONSTRAINT \"Activity_leadId_fkey\" FOREIGN KEY (\"leadId\") REFERENCES \"Lead\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Activity_quoteId_fkey",
        "sql": "ALTER TABLE \"Activity\" ADD CONSTRAINT \"Activity_quoteId_fkey\" FOREIGN KEY (\"quoteId\") REFERENCES \"Quote\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      }
    ]
  },
  "Airport": {
    "columns": [
      {
        "name": "id",
        "type": "integer",
        "notNull": true
      },
      {
        "name": "iata",
        "type": "text",
        "notNull": true
      },
      {
        "name": "icao",
        "type": "text",
        "notNull": false
      },
      {
        "name": "name",
        "type": "text",
        "notNull": true
      },
      {
        "name": "city",
        "type": "text",
        "notNull": true
      },
      {
        "name": "country",
        "type": "text",
        "notNull": true
      },
      {
        "name": "countryCode",
        "type": "text",
        "notNull": false
      },
      {
        "name": "timezone",
        "type": "text",
        "notNull": false
      },
      {
        "name": "latitude",
        "type": "double precision",
        "notNull": false
      },
      {
        "name": "longitude",
        "type": "double precision",
        "notNull": false
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Airport\" (\n  \"id\" integer NOT NULL DEFAULT nextval('\"Airport_id_seq\"'::regclass),\n  \"iata\" text NOT NULL,\n  \"icao\" text,\n  \"name\" text NOT NULL,\n  \"city\" text NOT NULL,\n  \"country\" text NOT NULL,\n  \"countryCode\" text,\n  \"timezone\" text,\n  \"latitude\" double precision,\n  \"longitude\" double precision\n)",
    "sequences": [
      {
        "column": "id",
        "name": "Airport_id_seq",
        "createSequence": "CREATE SEQUENCE IF NOT EXISTS \"Airport_id_seq\" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 NO CYCLE;",
        "setDefault": "ALTER TABLE \"Airport\" ALTER COLUMN \"id\" SET DEFAULT nextval('\"Airport_id_seq\"'::regclass);",
        "setOwnership": "ALTER SEQUENCE \"Airport_id_seq\" OWNED BY \"Airport\".\"id\";"
      }
    ],
    "primaryKey": {
      "name": "Airport_pkey",
      "sql": "ALTER TABLE \"Airport\" ADD CONSTRAINT \"Airport_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"Airport_city_idx\" ON public.\"Airport\" USING btree (city);",
      "CREATE INDEX \"Airport_country_idx\" ON public.\"Airport\" USING btree (country);",
      "CREATE UNIQUE INDEX \"Airport_iata_key\" ON public.\"Airport\" USING btree (iata);",
      "CREATE INDEX \"Airport_name_idx\" ON public.\"Airport\" USING btree (name);"
    ],
    "foreignKeys": []
  },
  "Subscriber": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "companyId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "email",
        "type": "text",
        "notNull": true
      },
      {
        "name": "status",
        "type": "\"SubscriberStatus\"",
        "notNull": true
      },
      {
        "name": "source",
        "type": "text",
        "notNull": false
      },
      {
        "name": "subscribedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "unsubscribedAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "unsubscribeToken",
        "type": "text",
        "notNull": true
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "updatedAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Subscriber\" (\n  \"id\" text NOT NULL,\n  \"companyId\" text NOT NULL,\n  \"email\" text NOT NULL,\n  \"status\" \"SubscriberStatus\" NOT NULL DEFAULT 'SUBSCRIBED'::\"SubscriberStatus\",\n  \"source\" text,\n  \"subscribedAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"unsubscribedAt\" timestamp(3) without time zone,\n  \"unsubscribeToken\" text NOT NULL,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"updatedAt\" timestamp(3) without time zone NOT NULL\n)",
    "sequences": [],
    "primaryKey": {
      "name": "Subscriber_pkey",
      "sql": "ALTER TABLE \"Subscriber\" ADD CONSTRAINT \"Subscriber_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE UNIQUE INDEX \"Subscriber_companyId_email_key\" ON public.\"Subscriber\" USING btree (\"companyId\", email);",
      "CREATE INDEX \"Subscriber_companyId_idx\" ON public.\"Subscriber\" USING btree (\"companyId\");",
      "CREATE INDEX \"Subscriber_status_idx\" ON public.\"Subscriber\" USING btree (status);",
      "CREATE UNIQUE INDEX \"Subscriber_unsubscribeToken_key\" ON public.\"Subscriber\" USING btree (\"unsubscribeToken\");"
    ],
    "foreignKeys": [
      {
        "name": "Subscriber_companyId_fkey",
        "sql": "ALTER TABLE \"Subscriber\" ADD CONSTRAINT \"Subscriber_companyId_fkey\" FOREIGN KEY (\"companyId\") REFERENCES \"Company\"(id) ON UPDATE CASCADE ON DELETE RESTRICT;"
      }
    ]
  },
  "Notification": {
    "columns": [
      {
        "name": "id",
        "type": "text",
        "notNull": true
      },
      {
        "name": "accountId",
        "type": "text",
        "notNull": true
      },
      {
        "name": "taskId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "type",
        "type": "text",
        "notNull": true
      },
      {
        "name": "title",
        "type": "text",
        "notNull": true
      },
      {
        "name": "body",
        "type": "text",
        "notNull": false
      },
      {
        "name": "readAt",
        "type": "timestamp(3) without time zone",
        "notNull": false
      },
      {
        "name": "createdAt",
        "type": "timestamp(3) without time zone",
        "notNull": true
      },
      {
        "name": "leadId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "quoteId",
        "type": "text",
        "notNull": false
      },
      {
        "name": "contactInquiryId",
        "type": "text",
        "notNull": false
      }
    ],
    "createTable": "CREATE TABLE IF NOT EXISTS \"Notification\" (\n  \"id\" text NOT NULL,\n  \"accountId\" text NOT NULL,\n  \"taskId\" text,\n  \"type\" text NOT NULL,\n  \"title\" text NOT NULL,\n  \"body\" text,\n  \"readAt\" timestamp(3) without time zone,\n  \"createdAt\" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  \"leadId\" text,\n  \"quoteId\" text,\n  \"contactInquiryId\" text\n)",
    "sequences": [],
    "primaryKey": {
      "name": "Notification_pkey",
      "sql": "ALTER TABLE \"Notification\" ADD CONSTRAINT \"Notification_pkey\" PRIMARY KEY (id);"
    },
    "uniqueConstraints": [],
    "indexes": [
      "CREATE INDEX \"Notification_accountId_idx\" ON public.\"Notification\" USING btree (\"accountId\");",
      "CREATE INDEX \"Notification_accountId_readAt_idx\" ON public.\"Notification\" USING btree (\"accountId\", \"readAt\");",
      "CREATE INDEX \"Notification_contactInquiryId_idx\" ON public.\"Notification\" USING btree (\"contactInquiryId\");",
      "CREATE INDEX \"Notification_leadId_idx\" ON public.\"Notification\" USING btree (\"leadId\");",
      "CREATE INDEX \"Notification_quoteId_idx\" ON public.\"Notification\" USING btree (\"quoteId\");",
      "CREATE INDEX \"Notification_taskId_idx\" ON public.\"Notification\" USING btree (\"taskId\");"
    ],
    "foreignKeys": [
      {
        "name": "Notification_accountId_fkey",
        "sql": "ALTER TABLE \"Notification\" ADD CONSTRAINT \"Notification_accountId_fkey\" FOREIGN KEY (\"accountId\") REFERENCES \"Account\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Notification_contactInquiryId_fkey",
        "sql": "ALTER TABLE \"Notification\" ADD CONSTRAINT \"Notification_contactInquiryId_fkey\" FOREIGN KEY (\"contactInquiryId\") REFERENCES \"ContactInquiry\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Notification_leadId_fkey",
        "sql": "ALTER TABLE \"Notification\" ADD CONSTRAINT \"Notification_leadId_fkey\" FOREIGN KEY (\"leadId\") REFERENCES \"Lead\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Notification_quoteId_fkey",
        "sql": "ALTER TABLE \"Notification\" ADD CONSTRAINT \"Notification_quoteId_fkey\" FOREIGN KEY (\"quoteId\") REFERENCES \"Quote\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      },
      {
        "name": "Notification_taskId_fkey",
        "sql": "ALTER TABLE \"Notification\" ADD CONSTRAINT \"Notification_taskId_fkey\" FOREIGN KEY (\"taskId\") REFERENCES \"Task\"(id) ON UPDATE CASCADE ON DELETE CASCADE;"
      }
    ]
  }
} as const;
