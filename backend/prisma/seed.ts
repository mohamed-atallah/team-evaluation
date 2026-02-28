import { PrismaClient, EmployeeLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: { systemRole: 'admin' },
    create: { name: 'Admin', description: 'System Administrator', systemRole: 'admin' },
  });

  const deptManagerRole = await prisma.role.upsert({
    where: { name: 'Department Manager' },
    update: { systemRole: 'department_manager' },
    create: { name: 'Department Manager', description: 'Head of Department', systemRole: 'department_manager' },
  });

  const teamManagerRole = await prisma.role.upsert({
    where: { name: 'Team Manager' },
    update: { systemRole: 'team_manager' },
    create: { name: 'Team Manager', description: 'Team Lead / Manager', systemRole: 'team_manager' },
  });

  const seniorRole = await prisma.role.upsert({
    where: { name: 'Senior' },
    update: { systemRole: 'senior' },
    create: { name: 'Senior', description: 'Senior Employee / Supervisor', systemRole: 'senior' },
  });

  const juniorRole = await prisma.role.upsert({
    where: { name: 'Junior' },
    update: { systemRole: 'junior' },
    create: { name: 'Junior', description: 'Junior Employee', systemRole: 'junior' },
  });

  // Define Permissions
  const permissions = [
    // NOTE: Only permissions listed here are kept — any extras in the DB are deleted below.
    // Screens
    { name: 'view:dashboard', description: 'Access to Dashboard', category: 'screens' },
    { name: 'view:evaluations', description: 'Access to Evaluations list', category: 'screens' },
    { name: 'view:team', description: 'Access to Team management', category: 'screens' },
    { name: 'view:admin', description: 'Access to Admin panel', category: 'screens' },
    { name: 'view:reports', description: 'Access to Reports', category: 'screens' },

    // Evaluations
    { name: 'evaluations:create', description: 'Create new evaluations', category: 'evaluations' },
    { name: 'evaluations:edit_own', description: 'Edit own evaluations', category: 'evaluations' },
    { name: 'evaluations:edit_all', description: 'Edit any evaluation', category: 'evaluations' },
    { name: 'evaluations:delete', description: 'Permanently delete evaluations', category: 'evaluations' },
    { name: 'evaluations:archive', description: 'Archive/Soft delete evaluations', category: 'evaluations' },
    { name: 'evaluations:approve', description: 'Approve/Review evaluations', category: 'evaluations' },
    { name: 'evaluations:view_all', description: 'View all evaluations in organization', category: 'evaluations' },
    { name: 'evaluations:create_calculated', description: 'Create calculated (averaged) evaluations from multiple sources', category: 'evaluations' },

    // Admin
    { name: 'admin:manage_roles', description: 'Manage roles and permissions', category: 'admin' },
    { name: 'admin:manage_users', description: 'Manage user accounts', category: 'admin' },
    { name: 'admin:manage_departments', description: 'Manage departments', category: 'admin' },
    { name: 'admin:manage_teams', description: 'Manage teams', category: 'admin' },
    { name: 'admin:manage_criteria', description: 'Manage evaluation criteria', category: 'admin' },
    { name: 'admin:manage_periods', description: 'Manage evaluation periods', category: 'admin' },
    { name: 'admin:manage_job_titles', description: 'Manage job titles', category: 'admin' },

    // Password management
    { name: 'admin:reset_user_password', description: "Reset any user's password", category: 'admin' },
  ];

  // Delete permissions no longer in the active list
  const activePermissionNames = permissions.map((p) => p.name);
  await prisma.permission.deleteMany({
    where: { name: { notIn: activePermissionNames } },
  });

  const seededPermissions: any = {};
  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { name: p.name },
      update: { description: p.description, category: p.category },
      create: p,
    });
    seededPermissions[p.name] = perm.id;
  }
  console.log('Seeded permissions');

  // Assign Permissions to Roles
  const adminPerms = Object.values(seededPermissions);
  const deptManagerPerms = [
    seededPermissions['view:dashboard'],
    seededPermissions['view:evaluations'],
    seededPermissions['view:team'],
    seededPermissions['view:reports'],
    seededPermissions['evaluations:approve'],
    seededPermissions['evaluations:view_all'],
    seededPermissions['admin:manage_departments'],
    seededPermissions['admin:manage_teams'],
  ];
  const teamManagerPerms = [
    seededPermissions['view:dashboard'],
    seededPermissions['view:evaluations'],
    seededPermissions['view:team'],
    seededPermissions['view:reports'],
    seededPermissions['evaluations:create'],
    seededPermissions['evaluations:edit_own'],
    seededPermissions['evaluations:approve'],
  ];
  const seniorPerms = [
    seededPermissions['view:dashboard'],
    seededPermissions['view:evaluations'],
    seededPermissions['evaluations:create'],
    seededPermissions['evaluations:edit_own'],
    seededPermissions['evaluations:approve'],
  ];
  const juniorPerms = [
    seededPermissions['view:dashboard'],
    seededPermissions['view:evaluations'],
    seededPermissions['evaluations:create'],
    seededPermissions['evaluations:edit_own'],
  ];

  const assignPerms = async (roleId: string, permIds: string[]) => {
    // Clear existing
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    // Add new
    await prisma.rolePermission.createMany({
      data: permIds.filter(Boolean).map(pid => ({ roleId, permissionId: pid }))
    });
  };

  await assignPerms(adminRole.id, adminPerms as string[]);
  await assignPerms(deptManagerRole.id, deptManagerPerms as string[]);
  await assignPerms(teamManagerRole.id, teamManagerPerms as string[]);
  await assignPerms(seniorRole.id, seniorPerms as string[]);
  await assignPerms(juniorRole.id, juniorPerms as string[]);
  console.log('Assigned permissions to roles');

  // Create Levels for Junior Role
  const juniorLevel = await prisma.level.upsert({
    where: { roleId_name: { roleId: juniorRole.id, name: 'Junior' } },
    update: {},
    create: { name: 'Junior', roleId: juniorRole.id, displayOrder: 1 },
  });

  // Create Levels for Senior Role
  const seniorLevel = await prisma.level.upsert({
    where: { roleId_name: { roleId: seniorRole.id, name: 'Senior' } },
    update: {},
    create: { name: 'Senior', roleId: seniorRole.id, displayOrder: 1 },
  });

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { roleId: adminRole.id },
    create: {
      email: 'admin@example.com',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      roleId: adminRole.id,
    },
  });
  console.log('Created admin user:', admin.email);

  // Create department
  const department = await prisma.department.upsert({
    where: { name: 'Software Engineering' },
    update: {},
    create: {
      name: 'Software Engineering',
      description: 'Engineering Department',
    },
  });

  // Create Department Manager
  const deptManagerPassword = await bcrypt.hash('manager123', 12);
  const deptManager = await prisma.user.upsert({
    where: { email: 'dept.manager@example.com' },
    update: { roleId: deptManagerRole.id },
    create: {
      email: 'dept.manager@example.com',
      passwordHash: deptManagerPassword,
      firstName: 'Sarah',
      lastName: 'Department',
      role: 'department_manager',
      roleId: deptManagerRole.id,
      departmentId: department.id,
    },
  });

  // Set department manager
  await prisma.department.update({
    where: { id: department.id },
    data: { managerId: deptManager.id }
  });

  // Create Team Manager
  const teamManagerPassword = await bcrypt.hash('manager123', 12);
  const teamManager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: { roleId: teamManagerRole.id },
    create: {
      email: 'manager@example.com',
      passwordHash: teamManagerPassword,
      firstName: 'Mike',
      lastName: 'Team',
      role: 'team_manager',
      roleId: teamManagerRole.id,
      departmentId: department.id,
      managerId: deptManager.id,
    },
  });

  // Create team
  const team = await prisma.team.upsert({
    where: { id: 'default-team' },
    update: { managerId: teamManager.id },
    create: {
      id: 'default-team',
      name: 'Engineering Team Alpha',
      departmentId: department.id,
      managerId: teamManager.id,
    },
  });

  // Create Senior Employee
  const seniorPassword = await bcrypt.hash('senior123', 12);
  const seniorEmployee = await prisma.user.upsert({
    where: { email: 'senior@example.com' },
    update: { roleId: seniorRole.id, levelId: seniorLevel.id },
    create: {
      email: 'senior@example.com',
      passwordHash: seniorPassword,
      firstName: 'John',
      lastName: 'Senior',
      role: 'senior',
      roleId: seniorRole.id,
      levelId: seniorLevel.id,
      yearsExperience: 7,
      departmentId: department.id,
      teamId: team.id,
      managerId: teamManager.id,
    },
  });

  // Create Junior Employees
  const userPassword = await bcrypt.hash('user123', 12);
  const juniorEmployee1 = await prisma.user.upsert({
    where: { email: 'junior@example.com' },
    update: { roleId: juniorRole.id, levelId: juniorLevel.id, seniorId: seniorEmployee.id },
    create: {
      email: 'junior@example.com',
      passwordHash: userPassword,
      firstName: 'Jane',
      lastName: 'Junior',
      role: 'junior',
      roleId: juniorRole.id,
      levelId: juniorLevel.id,
      yearsExperience: 1,
      departmentId: department.id,
      teamId: team.id,
      managerId: teamManager.id,
      seniorId: seniorEmployee.id,
    },
  });

  const juniorEmployee2 = await prisma.user.upsert({
    where: { email: 'junior2@example.com' },
    update: { roleId: juniorRole.id, levelId: juniorLevel.id },
    create: {
      email: 'junior2@example.com',
      passwordHash: userPassword,
      firstName: 'Joe',
      lastName: 'Junior',
      role: 'junior',
      roleId: juniorRole.id,
      levelId: juniorLevel.id,
      yearsExperience: 1,
      departmentId: department.id,
      teamId: team.id,
      managerId: teamManager.id,
      // No senior assigned, reports directly to Team Manager
    },
  });

  console.log('Created sample users');

  // Create evaluation period
  const period = await prisma.evaluationPeriod.upsert({
    where: { id: 'q1-2025' },
    update: {},
    create: {
      id: 'q1-2025',
      name: 'Q1 2025 Evaluation',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-03-31'),
      status: 'active',
      createdBy: admin.id,
    },
  });
  console.log('Created evaluation period:', period.name);

  // Seed Criteria helper
  const seedCriteria = async (criteriaList: any[]) => {
    const createdCriteria = [];
    for (const criteria of criteriaList) {
      const crit = await prisma.evaluationCriteria.upsert({
        where: { name: criteria.name },
        update: {
          description: criteria.description,
          expectations: criteria.expectations,
          behavioralIndicators: criteria.behavioralIndicators,
          scoringGuide: criteria.scoringGuide,
          displayOrder: criteria.displayOrder,
        },
        create: {
          name: criteria.name,
          description: criteria.description,
          expectations: criteria.expectations,
          behavioralIndicators: criteria.behavioralIndicators,
          scoringGuide: criteria.scoringGuide,
          displayOrder: criteria.displayOrder,
        }
      });
      createdCriteria.push(crit);
    }
    return createdCriteria;
  };

  // Seed Junior User Criteria
  const juniorCriteria = [
    {
      name: 'Bug Reporting',
      description: 'At least 70% bugs correctly assigned. 80% appropriate tags. Clear reports with evidence (screenshots, steps, logs).',
      expectations: 'At least 70% bugs correctly assigned. 80% appropriate tags. Clear reports with evidence (screenshots, steps, logs).',
      behavioralIndicators: 'Attaches screenshots consistently. Follows bug template. Asks for help when unsure about severity.',
      scoringGuide: {
        '3': '70%+ correct assignment',
        '4': '80%+ with detailed reports',
        '5': '90%+ with root cause hints',
      },
      displayOrder: 1,
    },
    {
      name: 'Test Case Design',
      description: 'Cover 70% of assigned features. Focus on basic functionality and common edge cases.',
      expectations: 'Cover 70% of assigned features. Focus on basic functionality and common edge cases.',
      behavioralIndicators: 'Uses test case templates. Documents preconditions clearly. Identifies obvious boundary conditions.',
      scoringGuide: {
        '3': '70% feature coverage',
        '4': '80%+ with edge cases',
        '5': 'Identifies non-obvious scenarios',
      },
      displayOrder: 2,
    },
    {
      name: 'Technical Skills',
      description: 'Basic proficiency with test management tools, bug tracking systems, and browser dev tools.',
      expectations: 'Basic proficiency with test management tools, bug tracking systems, and browser dev tools.',
      behavioralIndicators: 'Navigates JIRA/ClickUp independently. Uses browser inspector for basic debugging. Runs existing test scripts.',
      scoringGuide: {
        '3': 'Uses tools with guidance',
        '4': 'Independent tool usage',
        '5': 'Helps peers with tools',
      },
      displayOrder: 3,
    },
    {
      name: 'Communication',
      description: 'Seeks clarification proactively. Communicates progress and blockers. Prepares clear sprint demos.',
      expectations: 'Seeks clarification proactively. Communicates progress and blockers. Prepares clear sprint demos.',
      behavioralIndicators: 'Sends daily standup updates. Flags blockers within 2 hours. Asks questions before making assumptions.',
      scoringGuide: {
        '3': 'Communicates when prompted',
        '4': 'Proactive updates',
        '5': 'Clear, concise communication',
      },
      displayOrder: 4,
    },
    {
      name: 'Problem-Solving',
      description: 'Solves basic issues independently. Handles most issues with guidance. Learns from feedback.',
      expectations: 'Solves basic issues independently. Handles most issues with guidance. Learns from feedback.',
      behavioralIndicators: 'Attempts debugging before escalating. Documents troubleshooting steps. Applies feedback to future work.',
      scoringGuide: {
        '3': 'Solves with guidance',
        '4': 'Some independent solving',
        '5': 'Learns and applies quickly',
      },
      displayOrder: 5,
    },
    {
      name: 'Learning & Growth',
      description: 'Actively pursues skill development. Completes assigned training. Shows curiosity about testing practices.',
      expectations: 'Actively pursues skill development. Completes assigned training. Shows curiosity about testing practices.',
      behavioralIndicators: 'Completes training on schedule. Asks about unfamiliar concepts. Takes notes during reviews.',
      scoringGuide: {
        '3': 'Completes required training',
        '4': 'Self-directed learning',
        '5': 'Shares learnings with team',
      },
      displayOrder: 6,
    },
  ];

  // Seed Mid-Level User Criteria
  const midLevelCriteria = [
    {
      name: 'Bug Reporting',
      description: '80%+ correct assignment. 85%+ appropriate tags. Detailed reports with reproduction steps and impact analysis.',
      expectations: '80%+ correct assignment. 85%+ appropriate tags. Detailed reports with reproduction steps and impact analysis.',
      behavioralIndicators: 'Includes impact assessment. Suggests workarounds. Links related bugs. Rarely requires follow-up questions.',
      scoringGuide: {
        '3': '80%+ correct',
        '4': '90%+ with impact analysis',
        '5': 'Identifies systemic issues',
      },
      displayOrder: 1,
    },
    {
      name: 'Test Coverage',
      description: '80%+ feature coverage including edge cases and regression scenarios. Maintains traceability matrix.',
      expectations: '80%+ feature coverage including edge cases and regression scenarios. Maintains traceability matrix.',
      behavioralIndicators: 'Creates regression suites. Maps tests to requirements. Identifies gaps in existing coverage.',
      scoringGuide: {
        '3': '80% coverage',
        '4': '90%+ with traceability',
        '5': 'Comprehensive strategy',
      },
      displayOrder: 2,
    },
    {
      name: 'Technical Skills',
      description: 'Automation basics (scripting, API testing). Performance testing awareness. SQL for test data.',
      expectations: 'Automation basics (scripting, API testing). Performance testing awareness. SQL for test data.',
      behavioralIndicators: 'Writes basic automation scripts. Executes API tests. Queries databases for validation.',
      scoringGuide: {
        '3': 'Basic automation',
        '4': 'Independent API testing',
        '5': 'Creates reusable frameworks',
      },
      displayOrder: 3,
    },
    {
      name: 'Project Understanding',
      description: 'Solid understanding of business requirements. Aligns tests with business goals. Suggests improvements.',
      expectations: 'Solid understanding of business requirements. Aligns tests with business goals. Suggests improvements.',
      behavioralIndicators: 'Questions unclear requirements. Proposes test scenarios based on business context. Anticipates user behavior.',
      scoringGuide: {
        '3': 'Good understanding',
        '4': 'Proactive clarification',
        '5': 'Drives requirement quality',
      },
      displayOrder: 4,
    },
    {
      name: 'Communication',
      description: 'Proactive status updates. Effective risk communication. Provides constructive suggestions.',
      expectations: 'Proactive status updates. Effective risk communication. Provides constructive suggestions.',
      behavioralIndicators: 'Raises risks before they become blockers. Presents test status clearly. Facilitates discussions with devs.',
      scoringGuide: {
        '3': 'Clear communication',
        '4': 'Proactive risk flagging',
        '5': 'Influences decisions',
      },
      displayOrder: 5,
    },
    {
      name: 'Process Improvement',
      description: 'Identifies inefficiencies in testing processes. Proposes and implements improvements.',
      expectations: 'Identifies inefficiencies in testing processes. Proposes and implements improvements.',
      behavioralIndicators: 'Documents process bottlenecks. Suggests tooling improvements. Implements approved changes.',
      scoringGuide: {
        '3': 'Identifies issues',
        '4': 'Proposes solutions',
        '5': 'Drives implementation',
      },
      displayOrder: 6,
    },
    {
      name: 'Problem-Solving',
      description: 'Solves complex problems independently. Effective root cause analysis. Makes sound decisions.',
      expectations: 'Solves complex problems independently. Effective root cause analysis. Makes sound decisions.',
      behavioralIndicators: 'Debugs environment issues alone. Identifies root causes, not just symptoms. Escalates appropriately.',
      scoringGuide: {
        '3': 'Independent solving',
        '4': 'Complex problem analysis',
        '5': 'Mentors others',
      },
      displayOrder: 7,
    },
  ];

  // Seed Senior User Criteria
  const seniorCriteria = [
    {
      name: 'Bug Reporting (Senior)',
      description: '90%+ correct assignment. 95%+ appropriate tags. Highly detailed, actionable reports. Root cause analysis included.',
      expectations: '90%+ correct assignment. 95%+ appropriate tags. Highly detailed, actionable reports. Root cause analysis included.',
      behavioralIndicators: 'Reports require no follow-up. Identifies architectural implications. Proposes fixes or workarounds.',
      scoringGuide: {
        '3': 'Meets senior standards',
        '4': 'Influences bug processes',
        '5': 'Sets team standards',
      },
      displayOrder: 1,
    },
    {
      name: 'Test Strategy',
      description: '90%+ coverage including functional, non-functional, edge, and regression. Root cause analysis for escapes.',
      expectations: '90%+ coverage including functional, non-functional, edge, and regression. Root cause analysis for escapes.',
      behavioralIndicators: 'Designs test architecture. Balances coverage with efficiency. Conducts post-mortem analysis.',
      scoringGuide: {
        '3': 'Comprehensive coverage',
        '4': 'Strategic optimization',
        '5': 'Industry best practices',
      },
      displayOrder: 2,
    },
    {
      name: 'Technical Leadership',
      description: 'Automation framework design. CI/CD integration expertise. Performance/security testing strategy.',
      expectations: 'Automation framework design. CI/CD integration expertise. Performance/security testing strategy.',
      behavioralIndicators: 'Architects test frameworks. Integrates testing into pipelines. Evaluates and selects tools.',
      scoringGuide: {
        '3': 'Strong technical skills',
        '4': 'Guides technical direction',
        '5': 'Industry-recognized expertise',
      },
      displayOrder: 3,
    },
    {
      name: 'Strategic Understanding',
      description: 'Deep understanding of business goals. Aligns test strategy with company objectives. Identifies requirement gaps.',
      expectations: 'Deep understanding of business goals. Aligns test strategy with company objectives. Identifies requirement gaps.',
      behavioralIndicators: 'Participates in roadmap planning. Translates business needs to test priorities. Influences product decisions.',
      scoringGuide: {
        '3': 'Strong business alignment',
        '4': 'Strategic influence',
        '5': 'Trusted advisor',
      },
      displayOrder: 4,
    },
    {
      name: 'Mentoring & Leadership',
      description: 'Mentors junior and mid-level testers. Guides team in problem resolution. Drives quality culture.',
      expectations: 'Mentors junior and mid-level testers. Guides team in problem resolution. Drives quality culture.',
      behavioralIndicators: 'Conducts regular 1:1s with mentees. Provides actionable feedback. Creates training materials.',
      scoringGuide: {
        '3': 'Active mentoring',
        '4': 'Develops team capabilities',
        '5': 'Builds high-performing team',
      },
      displayOrder: 5,
    },
    {
      name: 'Cross-Functional Collaboration',
      description: 'Independent collaboration with developers, PMs, and stakeholders. Minimizes test lead involvement.',
      expectations: 'Independent collaboration with developers, PMs, and stakeholders. Minimizes test lead involvement.',
      behavioralIndicators: 'Drives quality discussions. Represents QA in architecture reviews. Builds relationships across teams.',
      scoringGuide: {
        '3': 'Effective collaboration',
        '4': 'Trusted partner',
        '5': 'Cross-org influence',
      },
      displayOrder: 6,
    },
    {
      name: 'Risk Identification',
      description: 'Proactively identifies quality risks. Develops mitigation strategies. Communicates risks to leadership.',
      expectations: 'Proactively identifies quality risks. Develops mitigation strategies. Communicates risks to leadership.',
      behavioralIndicators: 'Maintains risk register. Presents risk assessments to stakeholders. Implements preventive measures.',
      scoringGuide: {
        '3': 'Identifies risks',
        '4': 'Develops mitigations',
        '5': 'Prevents issues proactively',
      },
      displayOrder: 7,
    },
  ];

  const seededJuniorCriteria = await seedCriteria(juniorCriteria);
  const seededSeniorCriteria = await seedCriteria(seniorCriteria);
  const seededMidLevelCriteria = await seedCriteria(midLevelCriteria);

  // Create Job Titles
  const juniorTitle = await prisma.jobTitle.upsert({
    where: { name: 'Junior QA Engineer' },
    update: {},
    create: { name: 'Junior QA Engineer', description: 'Entry level quality assurance role' },
  });

  const seniorTitle = await prisma.jobTitle.upsert({
    where: { name: 'Senior QA Engineer' },
    update: {},
    create: { name: 'Senior QA Engineer', description: 'Experienced quality assurance role' },
  });

  // Assign criteria to job titles
  const assignJobCriteria = async (jobTitleId: string, criteria: any[]) => {
    for (let i = 0; i < criteria.length; i++) {
      await prisma.jobTitleCriteria.upsert({
        where: {
          jobTitleId_criteriaId: {
            jobTitleId: jobTitleId,
            criteriaId: criteria[i].id
          }
        },
        update: { displayOrder: i + 1 },
        create: {
          jobTitleId: jobTitleId,
          criteriaId: criteria[i].id,
          displayOrder: i + 1
        }
      });
    }
  };

  await assignJobCriteria(juniorTitle.id, seededJuniorCriteria);
  await assignJobCriteria(seniorTitle.id, seededSeniorCriteria);

  // Update users to have job titles
  await prisma.user.updateMany({
    where: { email: { in: ['junior@example.com', 'junior2@example.com'] } },
    data: { jobTitleId: juniorTitle.id }
  });

  await prisma.user.updateMany({
    where: { email: 'senior@example.com' },
    data: { jobTitleId: seniorTitle.id }
  });

  // Sync UserRoleRelation for existing users
  const allUsers = await prisma.user.findMany();
  for (const user of allUsers) {
    if (user.roleId) {
      await prisma.userRoleRelation.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: user.roleId
          }
        },
        update: {},
        create: {
          userId: user.id,
          roleId: user.roleId
        }
      });
    }
  }
  console.log('Synced UserRoleRelation for existing users');

  console.log('Seeded evaluation criteria');
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
