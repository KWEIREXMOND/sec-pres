import type { BriefingContent, ReportContent } from '@/lib/shared-types';
import type { AppConfig } from './config';
import { countRows, type Database } from './db';
import { addDays, addHours, hashPassword, id, makeReference, nowIso, toDateInput } from './utils';

const ORG = {
  zone: 'org-tema-secondary-zone',
  schoolA: 'org-tema-secondary-src',
  schoolB: 'org-tema-secondary-annex',
} as const;

const USER = {
  admin: 'user-system-admin',
  zonalPresident: 'user-zonal-president',
  zonalSecretary: 'user-zonal-secretary',
  schoolPresident: 'user-school-president',
  schoolSecretary: 'user-school-secretary',
  vicePresident: 'user-vice-president',
  executive: 'user-executive-member',
  temaSecretary: 'user-tema-secretary',
  organiser: 'user-tema-organiser',
  treasurer: 'user-tema-treasurer',
  pro: 'user-tema-pro',
  sportsChair: 'user-tema-sports-chair',
} as const;

interface OrgSeed {
  id: string;
  name: string;
  type: 'school' | 'zonal';
  parent: string | null;
  code: string;
  region: string;
  address: string;
  email: string;
  phone: string;
}

interface UserSeed {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  position: string;
  organization: string;
  phone: string;
  color: string;
  committee: string;
  responsibilities: string;
}

const organizations: OrgSeed[] = [
  {
    id: ORG.zone,
    name: 'Tema Secondary School SRC Executive Zone',
    type: 'zonal',
    parent: null,
    code: 'ZONE-TSS-001',
    region: 'Greater Accra',
    address: 'Tema Secondary School, Community 4',
    email: 'zone@temasec.test',
    phone: '+233 30 200 0100',
  },
  {
    id: ORG.schoolA,
    name: 'Tema Secondary School SRC',
    type: 'school',
    parent: ORG.zone,
    code: 'SCH-TSS-001',
    region: 'Greater Accra',
    address: 'Tema Secondary School, Community 4',
    email: 'src@temasec.test',
    phone: '+233 30 200 0110',
  },
  {
    id: ORG.schoolB,
    name: 'Tema Secondary School SRC Annex',
    type: 'school',
    parent: ORG.zone,
    code: 'SCH-TSS-002',
    region: 'Greater Accra',
    address: 'Tema Secondary School, Community 4',
    email: 'annex@temasec.test',
    phone: '+233 30 300 0120',
  },
];

const users: UserSeed[] = [
  {
    id: USER.admin,
    name: 'Nana Adjoa Mensah',
    email: 'admin@srcpro.test',
    password: 'AdminPass123!',
    role: 'system_admin',
    position: 'System Administrator',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 000 0000',
    color: '#0b1f3a',
    committee: 'Digital Administration',
    responsibilities: 'User accounts, security and platform configuration.',
  },
  {
    id: USER.zonalPresident,
    name: 'Kwesi Owusu-Afriyie',
    email: 'zonal.president@srcpro.test',
    password: 'President123!',
    role: 'zonal_president',
    position: 'TSS SRC Executive Zone President',
    organization: 'Tema Secondary School SRC Executive Zone',
    phone: '+233 24 111 0101',
    color: '#1d3459',
    committee: 'TSS SRC Executive Committee',
    responsibilities: 'Executive zone leadership, approvals and oversight.',
  },
  {
    id: USER.zonalSecretary,
    name: 'Ama Serwaa Boateng',
    email: 'zonal.secretary@srcpro.test',
    password: 'Secretary123!',
    role: 'zonal_secretary',
    position: 'TSS SRC Executive Zone Secretary',
    organization: 'Tema Secondary School SRC Executive Zone',
    phone: '+233 24 111 0202',
    color: '#276b40',
    committee: 'TSS SRC Secretariat',
    responsibilities: 'Executive zone correspondence, meetings, minutes and records.',
  },
  {
    id: USER.schoolPresident,
    name: 'Kofi Mensah Asante',
    email: 'school.president@srcpro.test',
    password: 'President123!',
    role: 'school_president',
    position: 'TSS SRC President',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 222 0101',
    color: '#a87422',
    committee: 'School Executive Committee',
    responsibilities: 'School SRC leadership and document approval.',
  },
  {
    id: USER.schoolSecretary,
    name: 'Efua Nyarko Danso',
    email: 'school.secretary@srcpro.test',
    password: 'Secretary123!',
    role: 'school_secretary',
    position: 'Annex SRC Secretary',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 222 0202',
    color: '#3e8b5b',
    committee: 'School Secretariat',
    responsibilities: 'School records, HELP inbox, meetings and correspondence.',
  },
  {
    id: USER.vicePresident,
    name: 'Abena Osei Tutu',
    email: 'vice.president@srcpro.test',
    password: 'Executive123!',
    role: 'vice_president',
    position: 'TSS SRC Vice President',
    organization: 'Tema Secondary School SRC Executive Zone',
    phone: '+233 24 111 0303',
    color: '#5482c2',
    committee: 'Programmes Committee',
    responsibilities: 'Programme coordination and delegated executive duties.',
  },
  {
    id: USER.executive,
    name: 'Yaw Asare Bediako',
    email: 'executive@srcpro.test',
    password: 'Executive123!',
    role: 'executive',
    position: 'Welfare Committee Chair',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 222 0303',
    color: '#86561f',
    committee: 'Welfare Committee',
    responsibilities: 'Student welfare programmes and assigned action items.',
  },
  {
    id: USER.temaSecretary,
    name: 'Akosua Frimpong',
    email: 'tema.secretary@srcpro.test',
    password: 'Secretary123!',
    role: 'school_secretary',
    position: 'Annex SRC Secretary',
    organization: 'Tema Secondary School SRC Annex',
    phone: '+233 24 333 0202',
    color: '#3562a6',
    committee: 'School Secretariat',
    responsibilities: 'Annex secretariat records.',
  },
  {
    id: USER.organiser,
    name: 'Nii Armah Tagoe',
    email: 'organiser@srcpro.test',
    password: 'Executive123!',
    role: 'executive',
    position: 'Organising Secretary',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 444 0101',
    color: '#276b40',
    committee: 'Events & Programmes',
    responsibilities: 'Coordinates SRC programmes, logistics and meeting attendance.',
  },
  {
    id: USER.treasurer,
    name: 'Esi Ansah',
    email: 'treasurer@srcpro.test',
    password: 'Executive123!',
    role: 'executive',
    position: 'SRC Treasurer',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 444 0202',
    color: '#a87422',
    committee: 'Finance Committee',
    responsibilities: 'Maintains verified budget records and expenditure documentation.',
  },
  {
    id: USER.pro,
    name: 'Kwame Boateng',
    email: 'pro@srcpro.test',
    password: 'Executive123!',
    role: 'executive',
    position: 'Public Relations Officer',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 444 0303',
    color: '#3562a6',
    committee: 'Communications Committee',
    responsibilities: 'Prepares approved circulars and official student communications.',
  },
  {
    id: USER.sportsChair,
    name: 'Aisha Mohammed',
    email: 'sports@srcpro.test',
    password: 'Executive123!',
    role: 'executive',
    position: 'Sports & Recreation Chair',
    organization: 'Tema Secondary School SRC',
    phone: '+233 24 444 0404',
    color: '#86561f',
    committee: 'Sports Committee',
    responsibilities: 'Coordinates sports, recreation and student welfare activities.',
  },
];

async function insert(db: Database, sql: string, params: unknown[] = []): Promise<void> {
  await db.query(sql, params);
}

function isoIn(days: number, hour = 10, minute = 0): string {
  const date = addDays(new Date(), days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function dateIn(days: number): string {
  return toDateInput(addDays(new Date(), days));
}

function reportContent(title: string, summary: string, count: number): ReportContent {
  return {
    title,
    executive_summary: summary,
    metrics: [
      { label: 'Meetings recorded', value: 4, hint: 'Within the selected period' },
      { label: 'Tasks completed', value: 3, hint: 'Verified completion dates' },
      { label: 'HELP requests resolved', value: 2, hint: 'Status history included' },
      { label: 'Documents approved', value: 2, hint: 'Approval records included' },
    ],
    sections: [
      {
        key: 'meetings',
        title: 'Meetings and attendance',
        summary: 'Meetings are listed from saved meeting and attendance records.',
        columns: [
          { key: 'title', label: 'Meeting' },
          { key: 'date', label: 'Date' },
          { key: 'status', label: 'Status' },
        ],
        records: [
          { title: 'Executive coordination meeting', date: dateIn(-12), status: 'Completed' },
          { title: 'Programme planning meeting', date: dateIn(5), status: 'Scheduled' },
        ],
      },
      {
        key: 'tasks',
        title: 'Decisions and action items',
        summary: 'Action items are compiled from the task register.',
        columns: [
          { key: 'title', label: 'Action' },
          { key: 'owner', label: 'Owner' },
          { key: 'status', label: 'Status' },
        ],
        records: [
          { title: 'Publish approved circulars', owner: 'School Secretary', status: 'Completed' },
          { title: 'Finalize zonal programme budget', owner: 'Vice President', status: 'In progress' },
        ],
      },
    ],
    limitations: 'Only records saved in this workspace and period are included. External channel delivery is reported separately.',
    source_record_count: count,
  };
}

function briefingContent(title: string): BriefingContent {
  return {
    title,
    overview: 'This briefing pack is compiled directly from saved meetings, tasks, approvals, HELP requests and calendar entries.',
    key_messages: [
      'Two executive decisions require follow-up before the next meeting.',
      'One urgent assistance request is awaiting acknowledgement.',
      'The TSS SRC leadership programme is the next major calendar commitment.',
    ],
    meetings: [
      { title: 'TSS SRC executive coordination', date: dateIn(2), venue: 'TSS SRC Secretariat', status: 'Scheduled' },
      { title: 'Schools liaison review', date: dateIn(-7), venue: 'Virtual', status: 'Completed' },
    ],
    tasks: [
      { title: 'Finalize programme budget', owner: 'Vice President', due: dateIn(3), status: 'In progress' },
      { title: 'Dispatch approved circular', owner: 'TSS SRC Secretary', due: dateIn(1), status: 'Awaiting review' },
    ],
    approvals: [
      { document: 'Official letter to regional director', status: 'Pending approval', submitted: dateIn(-1) },
      { document: 'Approved meeting minutes', status: 'Approved', submitted: dateIn(-8) },
    ],
    calendar: [
      { title: 'TSS SRC leadership programme', date: dateIn(9), location: 'Tema Secondary School' },
      { title: 'Executive deadline: budget submission', date: dateIn(3), location: 'Secretariat' },
    ],
    help_requests: [
      { reference: 'HELP-DEMO-001', subject: 'Urgent review of ceremony brief', status: 'New' },
      { reference: 'HELP-DEMO-002', subject: 'Transport confirmation', status: 'In progress' },
    ],
    source_record_count: 10,
  };
}

export async function seedDemoData(db: Database, config: AppConfig): Promise<void> {
  if (!config.seedDemoData) return;
  if ((await countRows(db, 'users')) > 0) return;

  const createdAt = nowIso();
  const passwordHashes = new Map<string, string>();
  for (const user of users) passwordHashes.set(user.id, await hashPassword(user.password));

  for (const org of organizations) {
    await insert(
      db,
      `INSERT INTO organizations
        (id, name, type, parent_id, code, letterhead_name, address, phone, email, motto, region, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        org.id,
        org.name,
        org.type,
        org.parent,
        org.code,
        `${org.name.toUpperCase()}\nOFFICE OF THE SRC SECRETARIAT`,
        org.address,
        org.phone,
        org.email,
        'Service • Accountability • Representation',
        org.region,
        createdAt,
      ],
    );
  }

  for (const user of users) {
    await insert(
      db,
      `INSERT INTO users
        (id, auth_user_id, name, email, password_hash, role, position, organization, phone, whatsapp_number,
         committee, responsibilities, avatar_color, is_active, last_login_at, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, NULL, $13::timestamptz, $13::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        user.id,
        user.name,
        user.email,
        passwordHashes.get(user.id),
        user.role,
        user.position,
        user.organization,
        user.phone,
        user.phone,
        user.committee,
        user.responsibilities,
        user.color,
        createdAt,
      ],
    );
    await insert(
      db,
      `INSERT INTO notification_preferences
        (user_id, in_app, email, sms, whatsapp, push, meeting_reminders, task_reminders, help_alerts)
       VALUES ($1, TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
    );
  }

  const memberships: Array<[string, string, string, boolean, boolean]> = [
    [ORG.zone, USER.admin, 'primary', false, true],
    [ORG.schoolA, USER.admin, 'primary', false, true],
    [ORG.schoolB, USER.admin, 'primary', false, true],
    [ORG.zone, USER.zonalPresident, 'primary', false, true],
    [ORG.zone, USER.zonalSecretary, 'primary', true, true],
    [ORG.zone, USER.vicePresident, 'delegate', false, true],
    [ORG.schoolA, USER.schoolPresident, 'primary', false, false],
    [ORG.schoolA, USER.schoolSecretary, 'primary', true, false],
    [ORG.schoolA, USER.executive, 'delegate', false, false],
    [ORG.schoolA, USER.organiser, 'delegate', false, false],
    [ORG.schoolA, USER.treasurer, 'delegate', false, false],
    [ORG.schoolA, USER.pro, 'delegate', false, false],
    [ORG.schoolA, USER.sportsChair, 'delegate', false, false],
    [ORG.schoolB, USER.temaSecretary, 'primary', true, false],
  ];
  for (const [organizationId, userId, membershipRole, isPrimary, canConsolidate] of memberships) {
    await insert(
      db,
      `INSERT INTO organization_members
        (organization_id, user_id, membership_role, is_primary_secretary, can_view_consolidated, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [organizationId, userId, membershipRole, isPrimary, canConsolidate, createdAt],
    );
  }

  const templates = [
    {
      name: 'Official SRC Letter',
      type: 'letter',
      description: 'Formal outward correspondence with configurable letterhead.',
      body: `{{letterhead}}\n\n{{date}}\n\n{{recipient}}\n\nDear Sir/Madam,\n\nRE: {{subject}}\n\n{{body}}\n\nYours faithfully,\n\n______________________________\n{{signatory}}\n{{position}}`,
    },
    {
      name: 'General Notice',
      type: 'notice',
      description: 'Short notice for meetings, programmes and circulars.',
      body: `{{letterhead}}\n\nNOTICE TO {{audience}}\n\nDATE: {{date}}\n\n{{subject}}\n\n{{body}}\n\nSigned:\n{{signatory}}\n{{position}}`,
    },
    {
      name: 'Meeting Agenda',
      type: 'agenda',
      description: 'Structured agenda prepared manually by the Secretary.',
      body: `{{meeting_title}}\n{{date}} | {{time}} | {{venue}}\n\nAGENDA\n1. Opening prayer and roll call\n2. Adoption of agenda\n3. Approval of previous minutes\n4. Matters arising\n5. {{main_business}}\n6. Any other business\n7. Closing remarks`,
    },
    {
      name: 'Meeting Minutes',
      type: 'minutes',
      description: 'Conventional minutes form populated by the minute taker.',
      body: `MINUTES OF {{meeting_title}}\nHELD ON {{date}} AT {{venue}}\n\nPRESENT: {{attendees}}\nAPOLOGIES: {{apologies}}\nCHAIR: {{chairperson}}\n\n1. OPENING\n{{opening_notes}}\n\n2. DISCUSSIONS\n{{discussions}}\n\n3. RESOLUTIONS\n{{resolutions}}\n\n4. ACTION ITEMS\n{{action_items}}\n\n5. CLOSING\n{{closing_notes}}\n\nPrepared by: {{signatory}}`,
    },
    {
      name: 'Internal Memorandum',
      type: 'memo',
      description: 'Internal memo to executives and committee leads.',
      body: `INTERNAL MEMORANDUM\n\nTO: {{recipient}}\nFROM: {{signatory}}\nDATE: {{date}}\nSUBJECT: {{subject}}\n\n{{body}}`,
    },
    {
      name: 'Monthly Report Outline',
      type: 'report',
      description: 'Editable framework for a monthly secretarial report.',
      body: `MONTHLY SECRETARIAL REPORT\nPeriod: {{period}}\nPrepared by: {{signatory}}\n\n1. EXECUTIVE SUMMARY\n{{summary}}\n\n2. MEETINGS AND ATTENDANCE\n{{meetings}}\n\n3. CORRESPONDENCE\n{{correspondence}}\n\n4. DECISIONS AND TASKS\n{{tasks}}\n\n5. CHALLENGES AND NEXT STEPS\n{{next_steps}}`,
    },
  ];
  for (const template of templates) {
    await insert(
      db,
      `INSERT INTO templates
        (id, organization_id, name, type, description, body, is_shared, created_by, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, TRUE, $6, $7::timestamptz, $7::timestamptz)`,
      [id('template'), template.name, template.type, template.description, template.body, USER.admin, createdAt],
    );
  }

  const meetingSeeds = [
    {
      id: 'meeting-zonal-exec-1',
      org: ORG.zone,
      title: 'TSS SRC Executive Coordination Meeting',
      type: 'zonal_executive',
      status: 'scheduled',
      starts: isoIn(2, 9, 30),
      venue: 'TSS SRC Conference Room',
      chair: 'Kwesi Owusu-Afriyie',
      agenda: '1. Adoption of agenda\n2. Programme budget\n3. School liaison updates\n4. Any other business',
      minutes: '',
      minutesStatus: 'not_started',
      createdBy: USER.zonalSecretary,
    },
    {
      id: 'meeting-zonal-review-1',
      org: ORG.zone,
      title: 'TSS SRC Liaison Review',
      type: 'committee',
      status: 'completed',
      starts: isoIn(-7, 14),
      venue: 'Virtual Meeting',
      chair: 'Abena Osei Tutu',
      agenda: '1. Review school reports\n2. Consolidated programme planning\n3. Action items',
      minutes: 'The committee reviewed participation from member schools and agreed to circulate the programme budget by the stated deadline. The secretariat was directed to compile consolidated figures without exposing individual school records.',
      minutesStatus: 'approved',
      createdBy: USER.zonalSecretary,
    },
    {
      id: 'meeting-school-exec-1',
      org: ORG.schoolA,
      title: 'TSS SRC Executive Meeting',
      type: 'school_executive',
      status: 'scheduled',
      starts: isoIn(1, 15),
      venue: 'SRC Office, Tema Secondary School',
      chair: 'Kofi Mensah Asante',
      agenda: '1. Opening and apologies\n2. Welfare programme\n3. Correspondence\n4. Action items',
      minutes: '',
      minutesStatus: 'not_started',
      createdBy: USER.schoolSecretary,
    },
    {
      id: 'meeting-school-emergency-1',
      org: ORG.schoolA,
      title: 'Emergency Welfare Committee Meeting',
      type: 'emergency',
      status: 'completed',
      starts: isoIn(-3, 8),
      venue: 'School Library',
      chair: 'Kofi Mensah Asante',
      agenda: '1. Student welfare complaint\n2. Immediate action plan\n3. Communication',
      minutes: 'Members agreed to publish a verified welfare circular and complete follow-up visits before the end of the week.',
      minutesStatus: 'draft',
      createdBy: USER.schoolSecretary,
    },
    {
      id: 'meeting-tema-programme-1',
      org: ORG.schoolB,
      title: 'Annex SRC Programme Planning',
      type: 'programme',
      status: 'scheduled',
      starts: isoIn(6, 11),
      venue: 'Annex School Hall',
      chair: 'Akosua Frimpong',
      agenda: '1. Programme outline\n2. Budget\n3. Logistics',
      minutes: '',
      minutesStatus: 'not_started',
      createdBy: USER.temaSecretary,
    },
  ];

  for (const meeting of meetingSeeds) {
    await insert(
      db,
      `INSERT INTO meetings
        (id, organization_id, title, meeting_type, status, starts_at, ends_at, venue, chairperson, agenda,
         discussions, minutes, minutes_status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz, $15::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        meeting.id,
        meeting.org,
        meeting.title,
        meeting.type,
        meeting.status,
        meeting.starts,
        addHours(meeting.starts, 2).toISOString(),
        meeting.venue,
        meeting.chair,
        meeting.agenda,
        meeting.status === 'completed' ? 'Saved discussion notes are available in the meeting record.' : '',
        meeting.minutes,
        meeting.minutesStatus,
        meeting.createdBy,
        createdAt,
      ],
    );
  }

  const attendeesByMeeting: Record<string, string[]> = {
    'meeting-zonal-exec-1': [USER.zonalPresident, USER.zonalSecretary, USER.vicePresident],
    'meeting-zonal-review-1': [USER.zonalPresident, USER.zonalSecretary, USER.vicePresident, USER.admin],
    'meeting-school-exec-1': [USER.schoolPresident, USER.schoolSecretary, USER.executive, USER.organiser, USER.treasurer, USER.pro, USER.sportsChair],
    'meeting-school-emergency-1': [USER.schoolPresident, USER.schoolSecretary, USER.executive, USER.organiser, USER.treasurer, USER.pro, USER.sportsChair],
    'meeting-tema-programme-1': [USER.temaSecretary],
  };
  const meetingCreatedBy = new Map(meetingSeeds.map((meeting) => [meeting.id, meeting.createdBy]));
  for (const [meetingId, attendees] of Object.entries(attendeesByMeeting)) {
    for (const userId of attendees) {
      const present = meetingId.includes('-1');
      await insert(
        db,
        `INSERT INTO meeting_attendees
          (id, meeting_id, user_id, rsvp_status, attendance, check_in_at, signed_in_by, signed_in_note)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8)
         ON CONFLICT (meeting_id, user_id) DO NOTHING`,
        [
          id('attendee'),
          meetingId,
          userId,
          present ? 'confirmed' : 'pending',
          present ? 'present' : 'unknown',
          present ? createdAt : null,
          present ? meetingCreatedBy.get(meetingId) || null : null,
          present ? 'Seeded verified attendance record.' : '',
        ],
      );
    }
  }

  const resolutions = [
    {
      id: 'resolution-zonal-1',
      org: ORG.zone,
      meeting: 'meeting-zonal-review-1',
      title: 'Circulate zonal programme budget',
      description: 'The secretariat should circulate the reviewed programme budget to all authorized executives.',
      mover: 'Abena Osei Tutu',
      seconder: 'Ama Serwaa Boateng',
      due: dateIn(3),
      createdBy: USER.zonalSecretary,
    },
    {
      id: 'resolution-school-1',
      org: ORG.schoolA,
      meeting: 'meeting-school-emergency-1',
      title: 'Publish verified welfare circular',
      description: 'Publish the approved welfare circular after presidential review.',
      mover: 'Yaw Asare Bediako',
      seconder: 'Efua Nyarko Danso',
      due: dateIn(2),
      createdBy: USER.schoolSecretary,
    },
  ];
  for (const [index, resolution] of resolutions.entries()) {
    await insert(
      db,
      `INSERT INTO resolutions
        (id, organization_id, meeting_id, reference, title, description, moved_by, seconded_by, status, due_date, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'adopted', $9::date, $10, $11::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        resolution.id,
        resolution.org,
        resolution.meeting,
        `RES-${dateIn(0).replaceAll('-', '')}-0${index + 1}`,
        resolution.title,
        resolution.description,
        resolution.mover,
        resolution.seconder,
        resolution.due,
        resolution.createdBy,
        createdAt,
      ],
    );
  }

  const tasks = [
    {
      id: 'task-zonal-budget',
      org: ORG.zone,
      meeting: 'meeting-zonal-review-1',
      resolution: 'resolution-zonal-1',
      title: 'Finalize zonal programme budget',
      description: 'Confirm venue, transport and refreshment figures with the finance committee.',
      assigned: USER.vicePresident,
      assignedBy: USER.zonalPresident,
      priority: 'high',
      status: 'in_progress',
      progress: 55,
      due: isoIn(3, 17),
      createdBy: USER.zonalSecretary,
    },
    {
      id: 'task-zonal-circular',
      org: ORG.zone,
      meeting: 'meeting-zonal-exec-1',
      resolution: null,
      title: 'Dispatch approved zonal circular',
      description: 'Dispatch the approved circular after presidential signature.',
      assigned: USER.zonalSecretary,
      assignedBy: USER.zonalPresident,
      priority: 'urgent',
      status: 'awaiting_review',
      progress: 80,
      due: isoIn(1, 16),
      createdBy: USER.zonalSecretary,
    },
    {
      id: 'task-school-welfare',
      org: ORG.schoolA,
      meeting: 'meeting-school-emergency-1',
      resolution: 'resolution-school-1',
      title: 'Publish verified welfare circular',
      description: 'Complete the notice and send it through the official correspondence register.',
      assigned: USER.schoolSecretary,
      assignedBy: USER.schoolPresident,
      priority: 'urgent',
      status: 'pending',
      progress: 20,
      due: isoIn(2, 14),
      createdBy: USER.schoolSecretary,
    },
    {
      id: 'task-school-attendance',
      org: ORG.schoolA,
      meeting: 'meeting-school-exec-1',
      resolution: null,
      title: 'Prepare meeting attendance sheet',
      description: 'Prepare and print the attendance sheet before the executive meeting.',
      assigned: USER.executive,
      assignedBy: USER.schoolSecretary,
      priority: 'normal',
      status: 'completed',
      progress: 100,
      due: isoIn(-1, 12),
      createdBy: USER.schoolSecretary,
    },
    {
      id: 'task-school-overdue',
      org: ORG.schoolA,
      meeting: null,
      resolution: null,
      title: 'Submit outstanding termly minutes',
      description: 'Submit the outstanding minutes to the President for review.',
      assigned: USER.schoolSecretary,
      assignedBy: USER.schoolPresident,
      priority: 'high',
      status: 'overdue',
      progress: 35,
      due: isoIn(-4, 17),
      createdBy: USER.schoolPresident,
    },
    {
      id: 'task-tema-venue',
      org: ORG.schoolB,
      meeting: 'meeting-tema-programme-1',
      resolution: null,
      title: 'Confirm programme venue logistics',
      description: 'Confirm hall availability and seating layout.',
      assigned: USER.temaSecretary,
      assignedBy: USER.admin,
      priority: 'normal',
      status: 'pending',
      progress: 10,
      due: isoIn(4, 15),
      createdBy: USER.temaSecretary,
    },
  ];
  for (const task of tasks) {
    await insert(
      db,
      `INSERT INTO tasks
        (id, organization_id, meeting_id, resolution_id, title, description, assigned_to, assigned_by,
         priority, status, progress, due_date, completed_at, completion_note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz, $14, $15::timestamptz, $15::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        task.id,
        task.org,
        task.meeting,
        task.resolution,
        task.title,
        task.description,
        task.assigned,
        task.assignedBy,
        task.priority,
        task.status,
        task.progress,
        task.due,
        task.status === 'completed' ? isoIn(-1, 13) : null,
        task.status === 'completed' ? 'Attendance sheet printed and filed.' : null,
        createdAt,
      ],
    );
    await insert(
      db,
      `INSERT INTO task_comments (id, task_id, user_id, comment, created_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)`,
      [id('task_comment'), task.id, task.createdBy, 'Action item recorded from the meeting register.', createdAt],
    );
  }

  const documents = [
    {
      id: 'document-zonal-letter',
      org: ORG.zone,
      title: 'Official Letter to Regional Director',
      kind: 'letter',
      category: 'Official Correspondence',
      reference: makeReference('LTR', addDays(new Date(), -2)),
      subject: 'Request for TSS SRC leadership programme support',
      recipient: 'The Regional Director of Education',
      content: `TEMA SECONDARY SCHOOL SRC\nOFFICE OF THE SRC SECRETARIAT\n\n21 October 2026\n\nThe Regional Director of Education\nGreater Accra Region\n\nDear Sir/Madam,\n\nRE: REQUEST FOR ZONAL LEADERSHIP PROGRAMME SUPPORT\n\nWe respectfully request your support for the upcoming TSS SRC leadership programme. The secretariat has attached the approved programme outline and budget for your consideration.\n\nWe remain grateful for your continued guidance and partnership.\n\nYours faithfully,\n\nKwesi Owusu-Afriyie\nTSS SRC Executive Zone President`,
      tags: 'correspondence,programme,approval',
      status: 'pending_approval',
      createdBy: USER.zonalSecretary,
      reviewedBy: null,
      version: 2,
    },
    {
      id: 'document-zonal-minutes',
      org: ORG.zone,
      title: 'Approved Minutes — Schools Liaison Review',
      kind: 'minutes',
      category: 'Meeting Minutes',
      reference: makeReference('MIN', addDays(new Date(), -7)),
      subject: 'Minutes of the schools liaison review',
      recipient: 'TSS SRC Executive Committee',
      content: `MINUTES OF SCHOOLS LIAISON REVIEW\n\nThe meeting reviewed participation from member schools. The committee agreed to circulate the programme budget and compile consolidated figures through the secretariat.\n\nResolved: The secretariat shall prepare a consolidated report without exposing confidential school-level records.\n\nPrepared by: Ama Serwaa Boateng`,
      tags: 'minutes,approved,zonal',
      status: 'approved',
      createdBy: USER.zonalSecretary,
      reviewedBy: USER.zonalPresident,
      version: 1,
    },
    {
      id: 'document-school-notice',
      org: ORG.schoolA,
      title: 'Draft Welfare Programme Notice',
      kind: 'notice',
      category: 'Notice',
      reference: makeReference('NTC', addDays(new Date(), -1)),
      subject: 'Welfare programme schedule',
      recipient: 'All students',
      content: `TEMA SECONDARY SCHOOL SRC\n\nNOTICE TO ALL STUDENTS\n\nThe SRC Welfare Committee will hold a verified welfare programme on Friday. Details of registration and the complaint desk are available at the SRC office.\n\nSigned:\nEfua Nyarko Danso\nSchool SRC Secretary`,
      tags: 'notice,welfare,draft',
      status: 'draft',
      createdBy: USER.schoolSecretary,
      reviewedBy: null,
      version: 1,
    },
    {
      id: 'document-school-constitution',
      org: ORG.schoolA,
      title: 'SRC Constitution — Approved Copy',
      kind: 'constitution',
      category: 'Governance',
      reference: 'CONST-AA-2026',
      subject: 'Approved SRC constitution',
      recipient: 'SRC Membership',
      content: `ACCRA ACADEMY SRC CONSTITUTION\n\nThis repository copy contains the approved constitution and standing orders. Amendments require a recorded executive resolution and presidential approval.`,
      tags: 'constitution,governance,repository',
      status: 'approved',
      createdBy: USER.schoolSecretary,
      reviewedBy: USER.schoolPresident,
      version: 1,
    },
  ];
  for (const document of documents) {
    await insert(
      db,
      `INSERT INTO documents
        (id, organization_id, title, kind, category, reference, subject, recipient, content, tags, status,
         template_id, meeting_id, created_by, reviewed_by, reviewed_at, review_comment, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, NULL, $12, $13, $14::timestamptz, $15, $16, $17::timestamptz, $17::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        document.id,
        document.org,
        document.title,
        document.kind,
        document.category,
        document.reference,
        document.subject,
        document.recipient,
        document.content,
        document.tags,
        document.status,
        document.createdBy,
        document.reviewedBy,
        document.reviewedBy ? isoIn(-1, 10) : null,
        document.reviewedBy ? 'Approved for official use.' : null,
        document.version,
        createdAt,
      ],
    );
    await insert(
      db,
      `INSERT INTO document_versions
        (id, document_id, organization_id, version, title, content, changed_by, change_note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
      [id('docver'), document.id, document.org, document.version, document.title, document.content, document.createdBy, 'Initial registered version.', createdAt],
    );
    if (document.reviewedBy) {
      await insert(
        db,
        `INSERT INTO document_reviews
          (id, document_id, organization_id, reviewer_id, decision, comment, created_at)
         VALUES ($1, $2, $3, $4, 'approved', $5, $6::timestamptz)`,
        [id('docreview'), document.id, document.org, document.reviewedBy, 'Approved after manual review.', isoIn(-1, 10)],
      );
    }
  }

  const correspondence = [
    {
      id: 'corr-zonal-incoming-1',
      org: ORG.zone,
      direction: 'incoming',
      reference: 'IN-ZONE-2026-018',
      subject: 'Regional office programme guidance',
      sender: 'Regional Education Office',
      recipient: 'TSS SRC Executive Zone President',
      document: null,
      status: 'answered',
      received: isoIn(-10, 9),
      due: isoIn(-5, 17),
      followUp: null,
      delivery: 'Delivered by official email.',
      response: 'Acknowledgement and programme brief submitted.',
      createdBy: USER.zonalSecretary,
    },
    {
      id: 'corr-zonal-outgoing-1',
      org: ORG.zone,
      direction: 'outgoing',
      reference: 'OUT-ZONE-2026-021',
      subject: 'Request for programme support',
      sender: 'Tema Secondary School SRC Executive Zone',
      recipient: 'Regional Director of Education',
      document: 'document-zonal-letter',
      status: 'pending_approval',
      received: isoIn(-2, 11),
      due: isoIn(2, 17),
      followUp: isoIn(2, 9),
      delivery: 'Awaiting presidential approval before dispatch.',
      response: '',
      createdBy: USER.zonalSecretary,
    },
    {
      id: 'corr-school-incoming-1',
      org: ORG.schoolA,
      direction: 'incoming',
      reference: 'IN-AA-2026-034',
      subject: 'Student welfare petition',
      sender: 'Student Representative Assembly',
      recipient: 'School SRC President',
      document: null,
      status: 'sent',
      received: isoIn(-3, 8),
      due: isoIn(1, 17),
      followUp: isoIn(1, 9),
      delivery: 'Hand-delivered to the SRC office.',
      response: 'Emergency committee meeting scheduled.',
      createdBy: USER.schoolSecretary,
    },
    {
      id: 'corr-school-outgoing-1',
      org: ORG.schoolA,
      direction: 'outgoing',
      reference: 'OUT-AA-2026-041',
      subject: 'Welfare programme circular',
      sender: 'Tema Secondary School SRC',
      recipient: 'All students',
      document: 'document-school-notice',
      status: 'draft',
      received: isoIn(-1, 14),
      due: isoIn(2, 17),
      followUp: null,
      delivery: 'Draft notice is awaiting approval.',
      response: '',
      createdBy: USER.schoolSecretary,
    },
  ];
  for (const item of correspondence) {
    await insert(
      db,
      `INSERT INTO correspondence
        (id, organization_id, direction, reference, subject, sender, recipient, document_id, status,
         received_at, dispatched_at, response_due_at, follow_up_at, delivery_details, response_notes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz, $13::timestamptz, $14, $15, $16, $17::timestamptz, $17::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        item.id,
        item.org,
        item.direction,
        item.reference,
        item.subject,
        item.sender,
        item.recipient,
        item.document,
        item.status,
        item.received,
        item.status === 'sent' || item.status === 'answered' ? item.received : null,
        item.due,
        item.followUp,
        item.delivery,
        item.response,
        item.createdBy,
        createdAt,
      ],
    );
  }

  const calendarEvents = [
    { id: 'calendar-zonal-programme', org: ORG.zone, title: 'TSS SRC leadership programme', type: 'zonal_programme', starts: isoIn(9, 9), ends: isoIn(9, 15), location: 'Tema Secondary School Main Hall', notes: 'Joint programme for participating schools.', meeting: null, createdBy: USER.zonalSecretary },
    { id: 'calendar-zonal-budget', org: ORG.zone, title: 'Budget submission deadline', type: 'deadline', starts: isoIn(3, 17), ends: null, location: 'Secretariat', notes: 'Budget figures must be verified.', meeting: null, createdBy: USER.zonalSecretary },
    { id: 'calendar-school-exec', org: ORG.schoolA, title: 'School SRC executive meeting', type: 'meeting', starts: isoIn(1, 15), ends: isoIn(1, 17), location: 'SRC Office', notes: 'Agenda has been prepared.', meeting: 'meeting-school-exec-1', createdBy: USER.schoolSecretary },
    { id: 'calendar-school-welfare', org: ORG.schoolA, title: 'Welfare programme', type: 'school_event', starts: isoIn(5, 10), ends: isoIn(5, 14), location: 'School Assembly Hall', notes: 'Approved circular required before dispatch.', meeting: null, createdBy: USER.schoolSecretary },
    { id: 'calendar-tema-planning', org: ORG.schoolB, title: 'Tema SRC planning meeting', type: 'meeting', starts: isoIn(6, 11), ends: isoIn(6, 13), location: 'School Hall', notes: 'Logistics review.', meeting: 'meeting-tema-programme-1', createdBy: USER.temaSecretary },
  ];
  for (const event of calendarEvents) {
    await insert(
      db,
      `INSERT INTO calendar_events
        (id, organization_id, title, type, starts_at, ends_at, location, notes, meeting_id, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.org, event.title, event.type, event.starts, event.ends, event.location, event.notes, event.meeting, event.createdBy, createdAt],
    );
  }

  const helpRequests = [
    {
      id: 'help-zonal-1',
      org: ORG.zone,
      requester: USER.zonalPresident,
      assignee: USER.zonalSecretary,
      client: 'demo-help-zonal-1',
      reference: 'HELP-GAR-2026-0001',
      subject: 'Urgent review of ceremony brief',
      description: 'Please review the ceremony brief and prepare the final speaking notes before the regional director arrives.',
      location: 'TSS SRC Secretariat, first floor',
      priority: 'critical',
      status: 'new',
      submitted: isoIn(0, 8).replace(/T.*/, 'T') + new Date().toISOString().slice(11),
      acknowledged: null,
      resolved: null,
      closed: null,
      note: null,
    },
    {
      id: 'help-zonal-2',
      org: ORG.zone,
      requester: USER.zonalPresident,
      assignee: USER.zonalSecretary,
      client: 'demo-help-zonal-2',
      reference: 'HELP-GAR-2026-0002',
      subject: 'Transport confirmation for school visits',
      description: 'Confirm transport arrangements for the scheduled school visits and update the itinerary.',
      location: 'Presidential Office',
      priority: 'urgent',
      status: 'in_progress',
      submitted: isoIn(-1, 9),
      acknowledged: isoIn(-1, 9).replace(/T.*/, 'T') + '09:15:00.000Z',
      resolved: null,
      closed: null,
      note: null,
    },
    {
      id: 'help-school-1',
      org: ORG.schoolA,
      requester: USER.schoolPresident,
      assignee: USER.schoolSecretary,
      client: 'demo-help-school-1',
      reference: 'HELP-AA-2026-0001',
      subject: 'Prepare emergency welfare statement',
      description: 'Draft a conventional statement from the verified committee notes for my review immediately.',
      location: 'Headmaster’s Conference Room',
      priority: 'urgent',
      status: 'acknowledged',
      submitted: isoIn(-1, 11),
      acknowledged: isoIn(-1, 11).replace(/T.*/, 'T') + '11:12:00.000Z',
      resolved: null,
      closed: null,
      note: null,
    },
    {
      id: 'help-school-2',
      org: ORG.schoolA,
      requester: USER.schoolPresident,
      assignee: USER.schoolSecretary,
      client: 'demo-help-school-2',
      reference: 'HELP-AA-2026-0002',
      subject: 'Retrieve approved minutes',
      description: 'Retrieve the approved executive minutes and place them in the President’s folder.',
      location: 'SRC Office',
      priority: 'normal',
      status: 'resolved',
      submitted: isoIn(-4, 10),
      acknowledged: isoIn(-4, 10).replace(/T.*/, 'T') + '10:10:00.000Z',
      resolved: isoIn(-4, 13),
      closed: null,
      note: 'Minutes retrieved and filed in the President’s folder.',
    },
  ];
  for (const help of helpRequests) {
    await insert(
      db,
      `INSERT INTO help_requests
        (id, organization_id, requester_id, assigned_to, client_request_id, reference, request_type, subject,
         description, location, priority, status, channel, submitted_at, acknowledged_at, resolved_at,
         closed_at, resolution_note, escalation_level, last_escalated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Urgent Assistance', $7, $8, $9, $10, $11, 'in_app',
               $12::timestamptz, $13::timestamptz, $14::timestamptz, $15::timestamptz, $16, 0, NULL,
               $12::timestamptz, $12::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        help.id,
        help.org,
        help.requester,
        help.assignee,
        help.client,
        help.reference,
        help.subject,
        help.description,
        help.location,
        help.priority,
        help.status,
        help.submitted,
        help.acknowledged,
        help.resolved,
        help.closed,
        help.note,
      ],
    );
    await insert(
      db,
      `INSERT INTO help_status_history
        (id, help_request_id, event_type, previous_status, new_status, actor_id, comment, created_at)
       VALUES ($1, $2, 'created', NULL, 'new', $3, 'Request submitted.', $4::timestamptz)`,
      [id('helpstatus'), help.id, help.requester, help.submitted],
    );
    if (help.status !== 'new') {
      await insert(
        db,
        `INSERT INTO help_status_history
          (id, help_request_id, event_type, previous_status, new_status, actor_id, comment, created_at)
         VALUES ($1, $2, 'status_change', 'new', 'acknowledged', $3, 'Receipt confirmed.', $4::timestamptz)`,
        [id('helpstatus'), help.id, help.assignee, help.acknowledged],
      );
    }
    if (help.status === 'in_progress' || help.status === 'resolved') {
      await insert(
        db,
        `INSERT INTO help_status_history
          (id, help_request_id, event_type, previous_status, new_status, actor_id, comment, created_at)
         VALUES ($1, $2, 'status_change', 'acknowledged', 'in_progress', $3, 'Working on the request.', $4::timestamptz)`,
        [id('helpstatus'), help.id, help.assignee, help.acknowledged],
      );
    }
    if (help.status === 'resolved') {
      await insert(
        db,
        `INSERT INTO help_status_history
          (id, help_request_id, event_type, previous_status, new_status, actor_id, comment, created_at)
         VALUES ($1, $2, 'status_change', 'in_progress', 'resolved', $3, $4, $5::timestamptz)`,
        [id('helpstatus'), help.id, help.assignee, help.note, help.resolved],
      );
    }
  }

  const announcements = [
    { id: 'announcement-zonal-1', org: ORG.zone, author: USER.zonalPresident, title: 'Leadership programme briefing', body: 'All executives should review the programme brief before Friday’s coordination meeting.', audience: 'all', pinned: true, created: isoIn(-1, 16) },
    { id: 'announcement-school-1', org: ORG.schoolA, author: USER.schoolSecretary, title: 'Minutes approval reminder', body: 'Outstanding emergency meeting minutes are awaiting presidential review.', audience: 'executives', pinned: false, created: isoIn(-2, 9) },
  ];
  for (const announcement of announcements) {
    await insert(
      db,
      `INSERT INTO announcements
        (id, organization_id, author_id, title, body, audience, is_pinned, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
      [announcement.id, announcement.org, announcement.author, announcement.title, announcement.body, announcement.audience, announcement.pinned, announcement.created],
    );
  }

  const messages = [
    { id: 'message-zonal-1', org: ORG.zone, sender: USER.zonalSecretary, recipient: USER.zonalPresident, subject: 'Programme brief', body: 'The revised programme brief is ready for your review in the approvals queue.', created: isoIn(-1, 10), read: null, help: null },
    { id: 'message-school-1', org: ORG.schoolA, sender: USER.schoolPresident, recipient: USER.schoolSecretary, subject: 'Welfare statement', body: 'Please keep the statement to one page and use the approved committee facts only.', created: isoIn(-1, 12), read: null, help: 'help-school-1' },
  ];
  for (const message of messages) {
    await insert(
      db,
      `INSERT INTO messages
        (id, organization_id, sender_id, recipient_id, subject, body, help_request_id, delivered_at, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $8::timestamptz)`,
      [message.id, message.org, message.sender, message.recipient, message.subject, message.body, message.help, message.created, message.read],
    );
  }

  const notifications = [
    { id: 'notification-zonal-1', user: USER.zonalSecretary, org: ORG.zone, type: 'help_new', title: 'Urgent HELP request', body: 'A critical request is awaiting acknowledgement.', link: '/workspace/help/help-zonal-1', severity: 'critical', read: false, dedupe: 'seed-help-zonal-1' },
    { id: 'notification-zonal-2', user: USER.zonalPresident, org: ORG.zone, type: 'document_pending', title: 'Document awaiting review', body: 'Official letter to the regional director is ready for approval.', link: '/workspace/documents/document-zonal-letter', severity: 'warning', read: false, dedupe: 'seed-doc-zonal-1' },
    { id: 'notification-school-1', user: USER.schoolSecretary, org: ORG.schoolA, type: 'help_new', title: 'HELP request acknowledged', body: 'The President submitted an urgent welfare statement request.', link: '/workspace/help/help-school-1', severity: 'critical', read: false, dedupe: 'seed-help-school-1' },
    { id: 'notification-school-2', user: USER.schoolPresident, org: ORG.schoolA, type: 'task_due', title: 'Deadline approaching', body: 'The welfare circular task is due soon.', link: '/workspace/tasks', severity: 'warning', read: true, dedupe: 'seed-task-school-1' },
  ];
  for (const notification of notifications) {
    await insert(
      db,
      `INSERT INTO notifications
        (id, user_id, organization_id, type, title, body, link, severity, is_read, read_at, dedupe_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11, $12::timestamptz)`,
      [
        notification.id,
        notification.user,
        notification.org,
        notification.type,
        notification.title,
        notification.body,
        notification.link,
        notification.severity,
        notification.read,
        notification.read ? createdAt : null,
        notification.dedupe,
        createdAt,
      ],
    );
    await insert(
      db,
      `INSERT INTO notification_deliveries
        (id, notification_id, user_id, channel, provider, status, recipient, attempts, provider_message_id, last_error, sent_at, next_retry_at, created_at)
       VALUES ($1, $2, $3, 'in_app', 'database+sse', 'delivered', $3, 1, NULL, NULL, $4::timestamptz, NULL, $4::timestamptz)`,
      [id('delivery'), notification.id, notification.user, createdAt],
    );
  }

  const monthlyContent = reportContent('Monthly Secretarial Report', 'A verified summary of meetings, correspondence, approvals and action items recorded during the current month.', 18);
  const termlyContent = reportContent('Termly Activity Report', 'This final report was edited and finalized from saved records for the current term.', 42);
  await insert(
    db,
    `INSERT INTO reports
      (id, organization_id, report_type, title, period_start, period_end, status, content, generated_by, finalized_at, created_at, updated_at)
     VALUES ($1, $2, 'monthly', $3, $4::date, $5::date, 'draft', $6::jsonb, $7, NULL, $8::timestamptz, $8::timestamptz),
            ($9, $2, 'termly', $10, $11::date, $5::date, 'final', $12::jsonb, $7, $8::timestamptz, $8::timestamptz, $8::timestamptz)`,
    [
      'report-zonal-monthly-draft',
      ORG.zone,
      monthlyContent.title,
      dateIn(-30),
      dateIn(0),
      JSON.stringify(monthlyContent),
      USER.zonalSecretary,
      createdAt,
      'report-zonal-termly-final',
      termlyContent.title,
      dateIn(-90),
      JSON.stringify(termlyContent),
    ],
  );

  const briefing = briefingContent('Presidential Briefing Pack — Current Cycle');
  await insert(
    db,
    `INSERT INTO briefing_packs
      (id, organization_id, title, period_start, period_end, content, compiled_by, created_at)
     VALUES ($1, $2, $3, $4::date, $5::date, $6::jsonb, $7, $8::timestamptz)`,
    ['briefing-zonal-current', ORG.zone, briefing.title, dateIn(-14), dateIn(14), JSON.stringify(briefing), USER.zonalSecretary, createdAt],
  );

  await insert(
    db,
    `INSERT INTO contact_logs
      (id, help_request_id, user_id, contact_user_id, channel, note, created_at)
     VALUES ($1, $2, $3, $4, 'in_app', $5, $6::timestamptz)`,
    [id('contact'), 'help-zonal-2', USER.zonalSecretary, USER.zonalPresident, 'Follow-up message sent through the in-app communication centre.', createdAt],
  );

  await insert(
    db,
    `INSERT INTO help_updates
      (id, help_request_id, user_id, kind, message, created_at)
     VALUES ($1, $2, $3, 'progress', $4, $5::timestamptz)`,
    [id('helpupdate'), 'help-zonal-2', USER.zonalSecretary, 'Transport provider has been contacted; confirmation is pending.', createdAt],
  );

  await insert(
    db,
    `INSERT INTO audit_logs
      (id, actor_id, organization_id, action, entity_type, entity_id, metadata, ip_address, user_agent, created_at)
     VALUES ($1, $2, $3, 'workspace.initialized', 'organization', $3, $4::jsonb, '127.0.0.1', 'seed-script', $5::timestamptz)`,
    [id('audit'), USER.admin, ORG.zone, JSON.stringify({ source: 'verified_demo_records' }), createdAt],
  );

  console.log('[seed] Demonstration workspaces, users and records are ready.');
}
