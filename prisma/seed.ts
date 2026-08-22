/**
 * Bootstraps the admin account and the three known projects. Run once
 * after migrations (`npm run db:seed`). Safe to re-run — everything is
 * upserted. See docs/HOSTINGER_DEPLOYMENT.md for when this runs in the
 * deploy flow.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_AGENT_ID = process.env.OPS_SEED_AGENT_ID || "fernando-agent";
const DEFAULT_HOSTNAME = process.env.OPS_SEED_HOSTNAME || "FERNANDO";

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminEmail || !adminPasswordHash) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be set to seed the admin account.");
  }

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, passwordHash: adminPasswordHash },
    update: { passwordHash: adminPasswordHash },
  });

  const machine = await prisma.machine.upsert({
    where: { agentId: DEFAULT_AGENT_ID },
    create: { agentId: DEFAULT_AGENT_ID, hostname: DEFAULT_HOSTNAME },
    update: { hostname: DEFAULT_HOSTNAME },
  });

  const projects = [
    {
      slug: "holasalta-manager",
      displayName: "HolaSalta Ops Backend",
      adapterKey: "holasalta_manager",
      supportsCommands: [] as string[],
    },
    {
      slug: "lvr",
      displayName: "LVR AutoPublicador",
      adapterKey: "lvr",
      supportsCommands: ["START", "STOP", "RESTART", "PAUSE_SCHEDULE", "RESUME_SCHEDULE"],
    },
    {
      slug: "holasalta-scrapping",
      displayName: "HolaSalta AutoPublicador",
      adapterKey: "holasalta_scrapping",
      supportsCommands: ["START", "STOP", "RESTART", "PAUSE_SCHEDULE", "RESUME_SCHEDULE"],
    },
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      create: { ...project, machineId: machine.id },
      update: { displayName: project.displayName, adapterKey: project.adapterKey, supportsCommands: project.supportsCommands },
    });
  }

  const alertRules = [
    {
      key: "machine_disk_low",
      name: "Disk space low",
      description: `${DEFAULT_HOSTNAME} disk free space below threshold.`,
      severity: "WARNING" as const,
      scope: "machine",
      projectSlug: null,
      config: { thresholdMb: 5000, forMinutes: 10 },
    },
    {
      key: "project_no_recent_success",
      name: "No recent successful run",
      description: "A pipeline project has gone unusually long without a successful run.",
      severity: "CRITICAL" as const,
      scope: "project",
      projectSlug: null, // applies to every project with discrete runs
      config: { thresholdMinutes: 90, forMinutes: 0 },
    },
    {
      key: "project_success_rate_low",
      name: "Success rate low",
      description: "A pipeline project's rolling success rate has dropped below threshold.",
      severity: "WARNING" as const,
      scope: "project",
      projectSlug: null,
      config: { thresholdPercent: 60, windowMinutes: 60, minSamples: 3, forMinutes: 10 },
    },
  ];

  for (const rule of alertRules) {
    await prisma.alertRule.upsert({
      where: { key: rule.key },
      create: rule,
      update: { name: rule.name, description: rule.description, severity: rule.severity, config: rule.config },
    });
  }

  console.log(
    `Seeded admin user (${adminEmail}), machine (${DEFAULT_HOSTNAME}), ${projects.length} projects, and ${alertRules.length} alert rules.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
