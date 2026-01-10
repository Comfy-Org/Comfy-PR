#!/usr/bin/env bun
import { format } from "date-fns";
import { ghc } from "./ghc";

interface TeamMember {
  username: string;
  startDate: Date;
  displayName: string;
}

interface Repository {
  owner: string;
  repo: string;
  displayName: string;
}

const TEAM_MEMBERS: TeamMember[] = [
  // Core team members - verified contributors (focusing on most active first)
  { username: "huchenlei", startDate: new Date("2020-01-01"), displayName: "HCL" },
  { username: "christian-byrne", startDate: new Date("2020-01-01"), displayName: "Christian" },
  { username: "robinjhuang", startDate: new Date("2020-01-01"), displayName: "Robin" },
  { username: "pythongosssss", startDate: new Date("2020-01-01"), displayName: "Simon" },
  {
    username: "bigcat88",
    startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    displayName: "BigCat",
  }, // 2 months ago
  { username: "ltdrdata", startDate: new Date("2020-01-01"), displayName: "Dr Lt Data" },
  { username: "guill", startDate: new Date("2024-06-01"), displayName: "Guill" },
  // Additional active contributors (temporarily limiting for performance)
  { username: "benceruleanlu", startDate: new Date("2020-01-01"), displayName: "Ben" },
  { username: "webfiltered", startDate: new Date("2020-01-01"), displayName: "Blake" },
  { username: "Kosinkadink", startDate: new Date("2020-01-01"), displayName: "Kosinkadink" },
  { username: "yoland68", startDate: new Date("2020-01-01"), displayName: "Yoland" },
  { username: "KohakuBlueleaf", startDate: new Date("2020-01-01"), displayName: "KohakuBlueleaf" },
  { username: "comfyanonymous", startDate: new Date("2020-01-01"), displayName: "Comfy" },
  { username: "snomiao", startDate: new Date("2020-01-01"), displayName: "Sno" },
];

// Static repositories list will be replaced with dynamic fetching
let REPOSITORIES: Repository[] = [];

async function fetchAllComfyOrgRepos(): Promise<Repository[]> {
  console.log("Using expanded list of Comfy-Org repositories...");

  // Hardcoded list of all important Comfy-Org repositories
  // This avoids rate limits and allows us to control exactly which repos to analyze
  const repos: Repository[] = [
    // Main repo
    { owner: "comfyanonymous", repo: "ComfyUI", displayName: "ComfyUI" },

    // Core frontend and desktop
    { owner: "Comfy-Org", repo: "ComfyUI_frontend", displayName: "Frontend" },
    { owner: "Comfy-Org", repo: "desktop", displayName: "Desktop" },

    // Infrastructure and tools
    { owner: "Comfy-Org", repo: "comfy-cli", displayName: "CLI" },
    { owner: "Comfy-Org", repo: "registry-web", displayName: "Registry Web" },
    { owner: "Comfy-Org", repo: "registry-backend", displayName: "Registry Backend" },
    { owner: "Comfy-Org", repo: "ComfyUI-Manager", displayName: "Manager" },

    // Documentation and resources
    { owner: "Comfy-Org", repo: "docs", displayName: "Docs" },
    { owner: "Comfy-Org", repo: "workflow_templates", displayName: "Workflow Templates" },
    { owner: "Comfy-Org", repo: "example_workflows", displayName: "Example Workflows" },

    // Libraries and APIs
    { owner: "Comfy-Org", repo: "litegraph.js", displayName: "Litegraph" },
    { owner: "Comfy-Org", repo: "comfy-api", displayName: "API" },

    // Development tools
    { owner: "Comfy-Org", repo: "ComfyUI_devtools", displayName: "DevTools" },
    { owner: "Comfy-Org", repo: "security-scanner", displayName: "Security Scanner" },

    // Cloud and services
    { owner: "Comfy-Org", repo: "cloud", displayName: "Cloud" },

    // Additional active repos
    { owner: "Comfy-Org", repo: "Comfy-PR", displayName: "PR Tools" },
    { owner: "Comfy-Org", repo: "ComfyUI_TensorRT", displayName: "TensorRT" },
    { owner: "Comfy-Org", repo: "homepage", displayName: "Homepage" },
    { owner: "Comfy-Org", repo: "rfcs", displayName: "RFCs" },
    { owner: "Comfy-Org", repo: "translations", displayName: "Translations" },
  ];

  console.log(`Analyzing ${repos.length} repositories`);
  return repos;
}

interface PRData {
  number: number;
  title: string;
  user: string;
  repository: string;
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
  timeToMerge?: number; // in days
}

interface QuarterStats {
  quarter: string;
  totalPRs: number;
  mergedPRs: number;
  openPRs: number;
  closedNotMerged: number;
  avgTimeToMerge: number | null; // in days
  medianTimeToMerge: number | null; // in days
}

interface RepoStats {
  repository: string;
  totalPRs: number;
  mergedPRs: number;
  openPRs: number;
  closedNotMerged: number;
  avgTimeToMerge: number | null;
  medianTimeToMerge: number | null;
}

interface MemberStats {
  member: string;
  totalPRs: number;
  mergedPRs: number;
  openPRs: number;
  closedNotMerged: number;
  avgTimeToMerge: number | null;
  medianTimeToMerge: number | null;
  quarterlyStats: QuarterStats[];
  repoStats: RepoStats[];
}

function getQuarter(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()} Q${quarter}`;
}

function calculateDaysBetween(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
}

interface DistributionStats {
  avgTimeToMerge: number | null;
  medianTimeToMerge: number | null;
  p25: number | null; // 25th percentile
  p75: number | null; // 75th percentile
  p90: number | null; // 90th percentile
  p95: number | null; // 95th percentile
  min: number | null;
  max: number | null;
  stdDev: number | null; // Standard deviation
  count: number;
  distribution: number[]; // Raw merge times for histogram
}

function calculatePercentile(sortedArray: number[], percentile: number): number {
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedArray[lower];
  }

  const weight = index - lower;
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

function calculateStats(prs: PRData[]): DistributionStats {
  const mergedPRs = prs.filter((pr) => pr.merged_at && pr.timeToMerge !== undefined);

  if (mergedPRs.length === 0) {
    return {
      avgTimeToMerge: null,
      medianTimeToMerge: null,
      p25: null,
      p75: null,
      p90: null,
      p95: null,
      min: null,
      max: null,
      stdDev: null,
      count: 0,
      distribution: [],
    };
  }

  const times = mergedPRs.map((pr) => pr.timeToMerge!).sort((a, b) => a - b);
  const avg = times.reduce((sum, time) => sum + time, 0) / times.length;

  // Calculate median
  let median: number;
  if (times.length % 2 === 0) {
    median = (times[times.length / 2 - 1] + times[times.length / 2]) / 2;
  } else {
    median = times[Math.floor(times.length / 2)];
  }

  // Calculate percentiles
  const p25 = calculatePercentile(times, 25);
  const p75 = calculatePercentile(times, 75);
  const p90 = calculatePercentile(times, 90);
  const p95 = calculatePercentile(times, 95);

  // Calculate standard deviation
  const variance = times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return {
    avgTimeToMerge: avg,
    medianTimeToMerge: median,
    p25,
    p75,
    p90,
    p95,
    min: times[0],
    max: times[times.length - 1],
    stdDev,
    count: times.length,
    distribution: times,
  };
}

async function fetchMemberPRsFromRepo(member: TeamMember, repo: Repository): Promise<PRData[]> {
  const allPRs: PRData[] = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const { data: prs } = await ghc.pulls.list({
        owner: repo.owner,
        repo: repo.repo,
        state: "all",
        sort: "created",
        direction: "desc",
        per_page: perPage,
        page,
      });

      if (prs.length === 0) break;

      let foundOlderPR = false;
      for (const pr of prs) {
        // Check if PR is from this team member
        if (pr.user?.login?.toLowerCase() !== member.username.toLowerCase()) {
          continue;
        }

        // Check if PR is after member's start date
        const prDate = new Date(pr.created_at);
        if (prDate < member.startDate) {
          foundOlderPR = true;
          continue;
        }

        const prData: PRData = {
          number: pr.number,
          title: pr.title,
          user: pr.user?.login || "unknown",
          repository: repo.displayName,
          state: pr.state as "open" | "closed",
          created_at: pr.created_at,
          closed_at: pr.closed_at,
          merged_at: pr.merged_at,
        };

        if (pr.merged_at) {
          prData.timeToMerge = calculateDaysBetween(pr.created_at, pr.merged_at);
        }

        allPRs.push(prData);
      }

      // If we've found PRs older than start date for this user, we can stop
      if (foundOlderPR) {
        break;
      }

      // Also check if the last PR in the page is older than start date
      const lastPR = prs[prs.length - 1];
      if (new Date(lastPR.created_at) < member.startDate) {
        break;
      }

      page++;
    }
  } catch (error) {
    console.error(`Error fetching PRs for ${member.displayName} from ${repo.displayName}:`, error);
  }

  return allPRs;
}

async function fetchMemberPRs(member: TeamMember): Promise<PRData[]> {
  console.log(`\nFetching PRs for ${member.displayName} (${member.username})...`);

  const allPRs: PRData[] = [];

  for (const repo of REPOSITORIES) {
    console.log(`  Checking ${repo.displayName}...`);
    const repoPRs = await fetchMemberPRsFromRepo(member, repo);
    if (repoPRs.length > 0) {
      console.log(`    Found ${repoPRs.length} PRs`);
    }
    allPRs.push(...repoPRs);
  }

  console.log(`Total: ${allPRs.length} PRs for ${member.displayName}`);
  return allPRs;
}

function generateQuarterlyStats(prs: PRData[]): QuarterStats[] {
  const quarterMap = new Map<string, PRData[]>();

  // Group PRs by quarter
  for (const pr of prs) {
    const quarter = getQuarter(new Date(pr.created_at));
    if (!quarterMap.has(quarter)) {
      quarterMap.set(quarter, []);
    }
    quarterMap.get(quarter)!.push(pr);
  }

  // Calculate stats for each quarter
  const quarterlyStats: QuarterStats[] = [];
  for (const [quarter, quarterPRs] of quarterMap) {
    const mergedPRs = quarterPRs.filter((pr) => pr.merged_at);
    const openPRs = quarterPRs.filter((pr) => pr.state === "open");
    const closedNotMerged = quarterPRs.filter((pr) => pr.state === "closed" && !pr.merged_at);

    const stats = calculateStats(quarterPRs);

    quarterlyStats.push({
      quarter,
      totalPRs: quarterPRs.length,
      mergedPRs: mergedPRs.length,
      openPRs: openPRs.length,
      closedNotMerged: closedNotMerged.length,
      avgTimeToMerge: stats.avgTimeToMerge,
      medianTimeToMerge: stats.medianTimeToMerge,
    });
  }

  // Sort by quarter
  return quarterlyStats.sort((a, b) => {
    const [aYear, aQ] = a.quarter.split(" Q").map(Number);
    const [bYear, bQ] = b.quarter.split(" Q").map(Number);
    return aYear !== bYear ? aYear - bYear : aQ - bQ;
  });
}

function generateRepoStats(prs: PRData[]): RepoStats[] {
  const repoMap = new Map<string, PRData[]>();

  // Group PRs by repository
  for (const pr of prs) {
    if (!repoMap.has(pr.repository)) {
      repoMap.set(pr.repository, []);
    }
    repoMap.get(pr.repository)!.push(pr);
  }

  // Calculate stats for each repository
  const repoStats: RepoStats[] = [];
  for (const [repository, repoPRs] of repoMap) {
    const mergedPRs = repoPRs.filter((pr) => pr.merged_at);
    const openPRs = repoPRs.filter((pr) => pr.state === "open");
    const closedNotMerged = repoPRs.filter((pr) => pr.state === "closed" && !pr.merged_at);

    const stats = calculateStats(repoPRs);

    repoStats.push({
      repository,
      totalPRs: repoPRs.length,
      mergedPRs: mergedPRs.length,
      openPRs: openPRs.length,
      closedNotMerged: closedNotMerged.length,
      avgTimeToMerge: stats.avgTimeToMerge,
      medianTimeToMerge: stats.medianTimeToMerge,
    });
  }

  return repoStats;
}

async function generateReport() {
  // Fetch all Comfy-Org repos first
  REPOSITORIES = await fetchAllComfyOrgRepos();

  console.log("=".repeat(80));
  console.log("Comfy Team PR Speed Analysis (All Repositories)");
  console.log("=".repeat(80));
  console.log(`Report generated: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`);
  console.log("\nRepositories analyzed:");
  for (const repo of REPOSITORIES) {
    console.log(`  - ${repo.owner}/${repo.repo}`);
  }

  const allMemberStats: MemberStats[] = [];
  let totalTeamPRs = 0;
  let totalMerged = 0;
  let totalOpen = 0;
  let totalClosedNotMerged = 0;
  const allMergeTimes: number[] = [];
  const repoTotals = new Map<
    string,
    {
      total: number;
      merged: number;
      open: number;
      closed: number;
      mergeTimes: number[];
    }
  >();

  const memberPRsMap = new Map<string, PRData[]>();

  for (const member of TEAM_MEMBERS) {
    const prs = await fetchMemberPRs(member);

    if (prs.length === 0) {
      console.log(`No PRs found for ${member.displayName}\n`);
      continue;
    }

    memberPRsMap.set(member.displayName, prs);

    const mergedPRs = prs.filter((pr) => pr.merged_at);
    const openPRs = prs.filter((pr) => pr.state === "open");
    const closedNotMerged = prs.filter((pr) => pr.state === "closed" && !pr.merged_at);

    const stats = calculateStats(prs);
    const quarterlyStats = generateQuarterlyStats(prs);
    const repoStats = generateRepoStats(prs);

    const memberStat: MemberStats = {
      member: member.displayName,
      totalPRs: prs.length,
      mergedPRs: mergedPRs.length,
      openPRs: openPRs.length,
      closedNotMerged: closedNotMerged.length,
      avgTimeToMerge: stats.avgTimeToMerge,
      medianTimeToMerge: stats.medianTimeToMerge,
      quarterlyStats,
      repoStats,
    };

    allMemberStats.push(memberStat);

    // Add to totals
    totalTeamPRs += prs.length;
    totalMerged += mergedPRs.length;
    totalOpen += openPRs.length;
    totalClosedNotMerged += closedNotMerged.length;
    mergedPRs.forEach((pr) => {
      if (pr.timeToMerge !== undefined) {
        allMergeTimes.push(pr.timeToMerge);
      }
    });

    // Add to repo totals
    for (const pr of prs) {
      if (!repoTotals.has(pr.repository)) {
        repoTotals.set(pr.repository, {
          total: 0,
          merged: 0,
          open: 0,
          closed: 0,
          mergeTimes: [],
        });
      }
      const repoData = repoTotals.get(pr.repository)!;
      repoData.total++;
      if (pr.merged_at) {
        repoData.merged++;
        if (pr.timeToMerge !== undefined) {
          repoData.mergeTimes.push(pr.timeToMerge);
        }
      } else if (pr.state === "open") {
        repoData.open++;
      } else {
        repoData.closed++;
      }
    }
  }

  // Print individual member stats
  console.log("\n" + "=".repeat(80));
  console.log("INDIVIDUAL MEMBER STATISTICS");
  console.log("=".repeat(80));

  for (const stat of allMemberStats) {
    console.log(`\n${stat.member}`);
    console.log("-".repeat(40));
    console.log(`Total PRs: ${stat.totalPRs}`);
    console.log(`  - Merged: ${stat.mergedPRs} (${((stat.mergedPRs / stat.totalPRs) * 100).toFixed(1)}%)`);
    console.log(`  - Open: ${stat.openPRs} (${((stat.openPRs / stat.totalPRs) * 100).toFixed(1)}%)`);
    console.log(
      `  - Closed (not merged): ${stat.closedNotMerged} (${((stat.closedNotMerged / stat.totalPRs) * 100).toFixed(1)}%)`,
    );

    if (stat.avgTimeToMerge !== null) {
      console.log(`Average time to merge: ${stat.avgTimeToMerge.toFixed(1)} days`);
      console.log(`Median time to merge: ${stat.medianTimeToMerge!.toFixed(1)} days`);
    }

    if (stat.repoStats.length > 0) {
      console.log("\nBy Repository:");
      for (const repo of stat.repoStats) {
        console.log(
          `  ${repo.repository}: ${repo.totalPRs} PRs (${repo.mergedPRs} merged, ${repo.openPRs} open, ${repo.closedNotMerged} closed)`,
        );
        if (repo.avgTimeToMerge !== null) {
          console.log(`    Avg merge time: ${repo.avgTimeToMerge.toFixed(1)} days`);
        }
      }
    }

    if (stat.quarterlyStats.length > 0) {
      console.log("\nQuarterly Breakdown:");
      for (const q of stat.quarterlyStats) {
        console.log(`  ${q.quarter}:`);
        console.log(
          `    Total: ${q.totalPRs} | Merged: ${q.mergedPRs} | Open: ${q.openPRs} | Closed: ${q.closedNotMerged}`,
        );
        if (q.avgTimeToMerge !== null) {
          console.log(
            `    Avg merge time: ${q.avgTimeToMerge.toFixed(1)} days | Median: ${q.medianTimeToMerge!.toFixed(1)} days`,
          );
        }
      }
    }
  }

  // Print team summary
  console.log("\n" + "=".repeat(80));
  console.log("TEAM SUMMARY (ALL REPOSITORIES)");
  console.log("=".repeat(80));
  console.log(`Total Team PRs: ${totalTeamPRs}`);
  console.log(`  - Merged: ${totalMerged} (${((totalMerged / totalTeamPRs) * 100).toFixed(1)}%)`);
  console.log(`  - Open: ${totalOpen} (${((totalOpen / totalTeamPRs) * 100).toFixed(1)}%)`);
  console.log(
    `  - Closed (not merged): ${totalClosedNotMerged} (${((totalClosedNotMerged / totalTeamPRs) * 100).toFixed(1)}%)`,
  );

  let avgTime = 0;
  let medianTime = 0;

  if (allMergeTimes.length > 0) {
    allMergeTimes.sort((a, b) => a - b);
    avgTime = allMergeTimes.reduce((sum, time) => sum + time, 0) / allMergeTimes.length;
    if (allMergeTimes.length % 2 === 0) {
      medianTime = (allMergeTimes[allMergeTimes.length / 2 - 1] + allMergeTimes[allMergeTimes.length / 2]) / 2;
    } else {
      medianTime = allMergeTimes[Math.floor(allMergeTimes.length / 2)];
    }

    console.log(`\nOverall average time to merge: ${avgTime.toFixed(1)} days`);
    console.log(`Overall median time to merge: ${medianTime.toFixed(1)} days`);
  }

  // Print repository breakdown
  console.log("\n" + "=".repeat(80));
  console.log("REPOSITORY BREAKDOWN");
  console.log("=".repeat(80));

  for (const [repo, data] of repoTotals) {
    console.log(`\n${repo}:`);
    console.log(`  Total PRs: ${data.total}`);
    console.log(`    - Merged: ${data.merged} (${((data.merged / data.total) * 100).toFixed(1)}%)`);
    console.log(`    - Open: ${data.open} (${((data.open / data.total) * 100).toFixed(1)}%)`);
    console.log(`    - Closed (not merged): ${data.closed} (${((data.closed / data.total) * 100).toFixed(1)}%)`);

    if (data.mergeTimes.length > 0) {
      const avg = data.mergeTimes.reduce((sum, t) => sum + t, 0) / data.mergeTimes.length;
      const sorted = [...data.mergeTimes].sort((a, b) => a - b);
      let median: number;
      if (sorted.length % 2 === 0) {
        median = (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      } else {
        median = sorted[Math.floor(sorted.length / 2)];
      }
      console.log(`    Average merge time: ${avg.toFixed(2)} days`);
      console.log(`    Median merge time: ${median.toFixed(2)} days`);
    }
  }

  // Generate quarterly team summary
  console.log("\n" + "=".repeat(80));
  console.log("QUARTERLY TEAM SUMMARY");
  console.log("=".repeat(80));

  const teamQuarterMap = new Map<
    string,
    {
      total: number;
      merged: number;
      open: number;
      closed: number;
      mergeTimes: number[];
    }
  >();

  for (const stat of allMemberStats) {
    for (const q of stat.quarterlyStats) {
      if (!teamQuarterMap.has(q.quarter)) {
        teamQuarterMap.set(q.quarter, {
          total: 0,
          merged: 0,
          open: 0,
          closed: 0,
          mergeTimes: [],
        });
      }

      const quarterData = teamQuarterMap.get(q.quarter)!;
      quarterData.total += q.totalPRs;
      quarterData.merged += q.mergedPRs;
      quarterData.open += q.openPRs;
      quarterData.closed += q.closedNotMerged;

      // Add merge times for this quarter
      if (q.avgTimeToMerge !== null && q.mergedPRs > 0) {
        // This is an approximation - we're using the average
        for (let i = 0; i < q.mergedPRs; i++) {
          quarterData.mergeTimes.push(q.avgTimeToMerge);
        }
      }
    }
  }

  const sortedQuarters = Array.from(teamQuarterMap.entries()).sort((a, b) => {
    const [aYear, aQ] = a[0].split(" Q").map(Number);
    const [bYear, bQ] = b[0].split(" Q").map(Number);
    return aYear !== bYear ? aYear - bYear : aQ - bQ;
  });

  for (const [quarter, data] of sortedQuarters) {
    console.log(`\n${quarter}:`);
    console.log(`  Total PRs: ${data.total}`);
    console.log(`    - Merged: ${data.merged} (${((data.merged / data.total) * 100).toFixed(1)}%)`);
    console.log(`    - Open: ${data.open} (${((data.open / data.total) * 100).toFixed(1)}%)`);
    console.log(`    - Closed (not merged): ${data.closed} (${((data.closed / data.total) * 100).toFixed(1)}%)`);

    if (data.mergeTimes.length > 0) {
      const avg = data.mergeTimes.reduce((sum, t) => sum + t, 0) / data.mergeTimes.length;
      console.log(`    Average merge time: ${avg.toFixed(1)} days`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Report complete!");

  // Collect all PRs for Gantt chart
  const allPRs: PRData[] = [];
  memberPRsMap.forEach((prs) => {
    allPRs.push(...prs);
  });

  // Return the data for JSON export
  return {
    generatedAt: new Date().toISOString(),
    repositories: REPOSITORIES,
    summary: {
      totalPRs: totalTeamPRs,
      mergedPRs: totalMerged,
      openPRs: totalOpen,
      closedPRs: totalClosedNotMerged,
      mergeRate: totalTeamPRs > 0 ? (totalMerged / totalTeamPRs) * 100 : 0,
      avgMergeTime: avgTime || 0,
      medianMergeTime: medianTime || 0,
    },
    allPRs: allPRs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      user: pr.user,
      repository: pr.repository,
      state: pr.state,
      created_at: pr.created_at,
      closed_at: pr.closed_at,
      merged_at: pr.merged_at,
      timeToMerge: pr.timeToMerge || null,
    })),
    memberStats: allMemberStats.map((stat) => {
      // Get all PRs for this member to calculate distribution
      const memberPRs = memberPRsMap.get(stat.member) || [];
      const distributionStats = calculateStats(memberPRs);

      return {
        member: stat.member,
        totalPRs: stat.totalPRs,
        merged: stat.mergedPRs,
        open: stat.openPRs,
        closed: stat.closedNotMerged,
        avgTime: stat.avgTimeToMerge || 0,
        medianTime: stat.medianTimeToMerge || 0,
        p25: distributionStats.p25 || 0,
        p75: distributionStats.p75 || 0,
        p90: distributionStats.p90 || 0,
        p95: distributionStats.p95 || 0,
        min: distributionStats.min || 0,
        max: distributionStats.max || 0,
        stdDev: distributionStats.stdDev || 0,
        distributionCount: distributionStats.count,
        distribution:
          distributionStats.distribution.length > 1000
            ? distributionStats.distribution.slice(0, 1000) // Limit size for JSON
            : distributionStats.distribution,
        quarterlyStats: stat.quarterlyStats,
        repoStats: stat.repoStats,
      };
    }),
    repoStats: Array.from(repoTotals.entries()).map(([repo, data]) => {
      let avgTime = 0;
      let medianTime = 0;
      if (data.mergeTimes.length > 0) {
        avgTime = data.mergeTimes.reduce((sum, t) => sum + t, 0) / data.mergeTimes.length;
        const sorted = [...data.mergeTimes].sort((a, b) => a - b);
        medianTime =
          sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];
      }
      return {
        repository: repo,
        totalPRs: data.total,
        merged: data.merged,
        open: data.open,
        closed: data.closed,
        avgTime,
        medianTime,
      };
    }),
    quarterlyStats: sortedQuarters.map(([quarter, data]) => ({
      quarter,
      total: data.total,
      merged: data.merged,
      open: data.open,
      closed: data.closed,
      avgTime: data.mergeTimes.length > 0 ? data.mergeTimes.reduce((sum, t) => sum + t, 0) / data.mergeTimes.length : 0,
    })),
  };
}

async function generateReportWithJSON() {
  const data = await generateReport();

  // Write JSON file
  const fs = await import("fs/promises");
  const pwd = process.cwd();
  const jsonPath = `${pwd}/data.json`;
  await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
  console.log(`\nJSON data saved to ${jsonPath}`);
  console.log(`View the interactive report at: ${pwd}/index.html`);

  return data;
}

if (import.meta.main) {
  generateReportWithJSON().catch(console.error);
}

export { fetchMemberPRs, generateReport, generateReportWithJSON, REPOSITORIES, TEAM_MEMBERS };
