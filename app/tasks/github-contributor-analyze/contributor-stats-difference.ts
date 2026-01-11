// Calculate difference between contributor stats
// Data from 2025-05-06 to 2025-06-26 (51 days)

const oldData = {
  date: "2025-05-06",
  emails: 3481,
  commitCount: 127081,
  repoCount: 2799,
  usernameCount: 4086,
};

const newData = {
  date: "2025-06-26",
  emails: 3875,
  dedupedEmails: 3851,
  commitCount: 143752,
  allRepoCount: 3216,
  usernameCount: 4553,
  cloneableRepoCount: 3051,
};

// Calculate differences
const daysDifference = Math.floor(
  (new Date(newData.date).getTime() - new Date(oldData.date).getTime()) / (1000 * 60 * 60 * 24),
);

const differences = {
  timePeriod: `${daysDifference} days`,
  emails: {
    absolute: newData.emails - oldData.emails,
    percentage: (((newData.emails - oldData.emails) / oldData.emails) * 100).toFixed(2) + "%",
    dailyAverage: ((newData.emails - oldData.emails) / daysDifference).toFixed(2),
  },
  commitCount: {
    absolute: newData.commitCount - oldData.commitCount,
    percentage: (((newData.commitCount - oldData.commitCount) / oldData.commitCount) * 100).toFixed(2) + "%",
    dailyAverage: ((newData.commitCount - oldData.commitCount) / daysDifference).toFixed(2),
  },
  repoCount: {
    absolute: newData.allRepoCount - oldData.repoCount,
    percentage: (((newData.allRepoCount - oldData.repoCount) / oldData.repoCount) * 100).toFixed(2) + "%",
    dailyAverage: ((newData.allRepoCount - oldData.repoCount) / daysDifference).toFixed(2),
  },
  usernameCount: {
    absolute: newData.usernameCount - oldData.usernameCount,
    percentage: (((newData.usernameCount - oldData.usernameCount) / oldData.usernameCount) * 100).toFixed(2) + "%",
    dailyAverage: ((newData.usernameCount - oldData.usernameCount) / daysDifference).toFixed(2),
  },
};

// Additional insights
const insights = {
  duplicateEmails: newData.emails - newData.dedupedEmails,
  duplicateEmailPercentage: (((newData.emails - newData.dedupedEmails) / newData.emails) * 100).toFixed(2) + "%",
  cloneableRepoPercentage: ((newData.cloneableRepoCount / newData.allRepoCount) * 100).toFixed(2) + "%",
  nonCloneableRepos: newData.allRepoCount - newData.cloneableRepoCount,
};

console.log("=== CONTRIBUTOR STATS ANALYSIS ===");
console.log(`Time Period: ${differences.timePeriod} (${oldData.date} to ${newData.date})\n`);

console.log("📧 EMAIL GROWTH:");
console.log(`  Total increase: ${differences.emails.absolute} emails (${differences.emails.percentage})`);
console.log(`  Daily average: ${differences.emails.dailyAverage} new emails/day`);
console.log(`  Current duplicates: ${insights.duplicateEmails} (${insights.duplicateEmailPercentage})\n`);

console.log("💾 COMMIT GROWTH:");
console.log(`  Total increase: ${differences.commitCount.absolute} commits (${differences.commitCount.percentage})`);
console.log(`  Daily average: ${differences.commitCount.dailyAverage} new commits/day\n`);

console.log("📁 REPOSITORY GROWTH:");
console.log(`  Total increase: ${differences.repoCount.absolute} repos (${differences.repoCount.percentage})`);
console.log(`  Daily average: ${differences.repoCount.dailyAverage} new repos/day`);
console.log(
  `  Cloneable repos: ${newData.cloneableRepoCount}/${newData.allRepoCount} (${insights.cloneableRepoPercentage})`,
);
console.log(`  Non-cloneable: ${insights.nonCloneableRepos} repos\n`);

console.log("👤 USERNAME GROWTH:");
console.log(
  `  Total increase: ${differences.usernameCount.absolute} usernames (${differences.usernameCount.percentage})`,
);
console.log(`  Daily average: ${differences.usernameCount.dailyAverage} new usernames/day\n`);

console.log("=== SUMMARY ===");
console.log("Growth trends over 51 days:");
console.log(`- Emails: ${differences.emails.percentage} growth`);
console.log(`- Commits: ${differences.commitCount.percentage} growth`);
console.log(`- Repositories: ${differences.repoCount.percentage} growth`);
console.log(`- Usernames: ${differences.usernameCount.percentage} growth`);
