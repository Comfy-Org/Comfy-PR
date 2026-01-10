import type { components as GithubApiComponents } from "@octokit/openapi-types";
type S = GithubApiComponents["schemas"];
export type WEBHOOK_EVENTS = {
  branch_protection_configuration: S[`webhook-branch-protection-configuration${string}` & keyof S];
  branch_protection_rule: S[`webhook-branch-protection-rule${string}` & keyof S];
  check_run: S[`webhook-check-run${string}` & keyof S];
  check_suite: S[`webhook-check-suite${string}` & keyof S];
  code_scanning_alert: S[`webhook-code-scanning-alert${string}` & keyof S];
  commit_comment: S[`webhook-commit-comment${string}` & keyof S];
  create: S[`webhook-create${string}` & keyof S];
  custom_property: S[`webhook-custom-property${string}` & keyof S];
  custom_property_values: S[`webhook-custom-property-values${string}` & keyof S];
  delete: S[`webhook-delete${string}` & keyof S];
  dependabot_alert: S[`webhook-dependabot-alert${string}` & keyof S];
  deploy_key: S[`webhook-deploy-key${string}` & keyof S];
  deployment: S[`webhook-deployment${string}` & keyof S];
  deployment_protection_rule: S[`webhook-deployment-protection-rule${string}` & keyof S];
  deployment_review: S[`webhook-deployment-review${string}` & keyof S];
  deployment_status: S[`webhook-deployment-status${string}` & keyof S];
  discussion: S[`webhook-discussion${string}` & keyof S];
  discussion_comment: S[`webhook-discussion-comment${string}` & keyof S];
  fork: S[`webhook-fork${string}` & keyof S];
  github_app_authorization: S[`webhook-github-app-authorization${string}` & keyof S];
  gollum: S[`webhook-gollum${string}` & keyof S];
  installation: S[`webhook-installation${string}` & keyof S];
  installation_repositories: S[`webhook-installation-repositories${string}` & keyof S];
  installation_target: S[`webhook-installation-target${string}` & keyof S];
  issue_comment: S[`webhook-issue-comment${string}` & keyof S];
  issue_dependencies: S[`webhook-issue-dependencies${string}` & keyof S];
  issues: S[`webhook-issues${string}` & keyof S];
  label: S[`webhook-label${string}` & keyof S];
  marketplace_purchase: S[`webhook-marketplace-purchase${string}` & keyof S];
  member: S[`webhook-member${string}` & keyof S];
  membership: S[`webhook-membership${string}` & keyof S];
  merge_group: S[`webhook-merge-group${string}` & keyof S];
  meta: S[`webhook-meta${string}` & keyof S];
  milestone: S[`webhook-milestone${string}` & keyof S];
  org_block: S[`webhook-org-block${string}` & keyof S];
  organization: S[`webhook-organization${string}` & keyof S];
  package: S[`webhook-package${string}` & keyof S];
  page_build: S[`webhook-page-build${string}` & keyof S];
  personal_access_token_request: S[`webhook-personal-access-token-request${string}` & keyof S];
  ping: S[`webhook-ping${string}` & keyof S];
  project: S[`webhook-project${string}` & keyof S];
  project_card: S[`webhook-project-card${string}` & keyof S];
  project_column: S[`webhook-project-column${string}` & keyof S];
  projects_v2: S[`webhook-projects-v2${string}` & keyof S];
  projects_v2_item: S[`webhook-projects-v2-item${string}` & keyof S];
  projects_v2_status_update: S[`webhook-projects-v2-status-update${string}` & keyof S];
  public: S[`webhook-public${string}` & keyof S];
  pull_request: S[`webhook-pull-request${string}` & keyof S];
  pull_request_review: S[`webhook-pull-request-review${string}` & keyof S];
  pull_request_review_comment: S[`webhook-pull-request-review-comment${string}` & keyof S];
  pull_request_review_thread: S[`webhook-pull-request-review-thread${string}` & keyof S];
  push: S[`webhook-push${string}` & keyof S];
  registry_package: S[`webhook-registry-package${string}` & keyof S];
  release: S[`webhook-release${string}` & keyof S];
  repository: S[`webhook-repository${string}` & keyof S];
  repository_advisory: S[`webhook-repository-advisory${string}` & keyof S];
  repository_dispatch: S[`webhook-repository-dispatch${string}` & keyof S];
  repository_import: S[`webhook-repository-import${string}` & keyof S];
  repository_ruleset: S[`webhook-repository-ruleset${string}` & keyof S];
  repository_vulnerability_alert: S[`webhook-repository-vulnerability-alert${string}` & keyof S];
  secret_scanning_alert: S[`webhook-secret-scanning-alert${string}` & keyof S];
  secret_scanning_alert_location: S[`webhook-secret-scanning-alert-location${string}` & keyof S];
  secret_scanning_scan: S[`webhook-secret-scanning-scan${string}` & keyof S];
  security_advisory: S[`webhook-security-advisory${string}` & keyof S];
  security_and_analysis: S[`webhook-security-and-analysis${string}` & keyof S];
  sponsorship: S[`webhook-sponsorship${string}` & keyof S];
  star: S[`webhook-star${string}` & keyof S];
  status: S[`webhook-status${string}` & keyof S];
  sub_issues: S[`webhook-sub-issues${string}` & keyof S];
  team: S[`webhook-team${string}` & keyof S];
  team_add: S[`webhook-team-add${string}` & keyof S];
  watch: S[`webhook-watch${string}` & keyof S];
  workflow_dispatch: S[`webhook-workflow-dispatch${string}` & keyof S];
  workflow_job: S[`webhook-workflow-job${string}` & keyof S];
  workflow_run: S[`webhook-workflow-run${string}` & keyof S];
};
// export type WEBHOOK_EVENT<K extends keyof WEBHOOK_EVENTS = keyof WEBHOOK_EVENTS> = {
//   type: K;
//   payload: WEBHOOK_EVENTS[K];
// };
export type WEBHOOK_EVENT =
  | {
      type: "branch_protection_configuration";
      payload: WEBHOOK_EVENTS["branch_protection_configuration"];
    }
  | { type: "branch_protection_rule"; payload: WEBHOOK_EVENTS["branch_protection_rule"] }
  | { type: "check_run"; payload: WEBHOOK_EVENTS["check_run"] }
  | { type: "check_suite"; payload: WEBHOOK_EVENTS["check_suite"] }
  | { type: "code_scanning_alert"; payload: WEBHOOK_EVENTS["code_scanning_alert"] }
  | { type: "commit_comment"; payload: WEBHOOK_EVENTS["commit_comment"] }
  | { type: "create"; payload: WEBHOOK_EVENTS["create"] }
  | { type: "custom_property"; payload: WEBHOOK_EVENTS["custom_property"] }
  | { type: "custom_property_values"; payload: WEBHOOK_EVENTS["custom_property_values"] }
  | { type: "delete"; payload: WEBHOOK_EVENTS["delete"] }
  | { type: "dependabot_alert"; payload: WEBHOOK_EVENTS["dependabot_alert"] }
  | { type: "deploy_key"; payload: WEBHOOK_EVENTS["deploy_key"] }
  | { type: "deployment"; payload: WEBHOOK_EVENTS["deployment"] }
  | { type: "deployment_protection_rule"; payload: WEBHOOK_EVENTS["deployment_protection_rule"] }
  | { type: "deployment_review"; payload: WEBHOOK_EVENTS["deployment_review"] }
  | { type: "deployment_status"; payload: WEBHOOK_EVENTS["deployment_status"] }
  | { type: "discussion"; payload: WEBHOOK_EVENTS["discussion"] }
  | { type: "discussion_comment"; payload: WEBHOOK_EVENTS["discussion_comment"] }
  | { type: "fork"; payload: WEBHOOK_EVENTS["fork"] }
  | { type: "github_app_authorization"; payload: WEBHOOK_EVENTS["github_app_authorization"] }
  | { type: "gollum"; payload: WEBHOOK_EVENTS["gollum"] }
  | { type: "installation"; payload: WEBHOOK_EVENTS["installation"] }
  | { type: "installation_repositories"; payload: WEBHOOK_EVENTS["installation_repositories"] }
  | { type: "installation_target"; payload: WEBHOOK_EVENTS["installation_target"] }
  | { type: "issue_comment"; payload: WEBHOOK_EVENTS["issue_comment"] }
  | { type: "issue_dependencies"; payload: WEBHOOK_EVENTS["issue_dependencies"] }
  | { type: "issues"; payload: WEBHOOK_EVENTS["issues"] }
  | { type: "label"; payload: WEBHOOK_EVENTS["label"] }
  | { type: "marketplace_purchase"; payload: WEBHOOK_EVENTS["marketplace_purchase"] }
  | { type: "member"; payload: WEBHOOK_EVENTS["member"] }
  | { type: "membership"; payload: WEBHOOK_EVENTS["membership"] }
  | { type: "merge_group"; payload: WEBHOOK_EVENTS["merge_group"] }
  | { type: "meta"; payload: WEBHOOK_EVENTS["meta"] }
  | { type: "milestone"; payload: WEBHOOK_EVENTS["milestone"] }
  | { type: "org_block"; payload: WEBHOOK_EVENTS["org_block"] }
  | { type: "organization"; payload: WEBHOOK_EVENTS["organization"] }
  | { type: "package"; payload: WEBHOOK_EVENTS["package"] }
  | { type: "page_build"; payload: WEBHOOK_EVENTS["page_build"] }
  | {
      type: "personal_access_token_request";
      payload: WEBHOOK_EVENTS["personal_access_token_request"];
    }
  | { type: "ping"; payload: WEBHOOK_EVENTS["ping"] }
  | { type: "project"; payload: WEBHOOK_EVENTS["project"] }
  | { type: "project_card"; payload: WEBHOOK_EVENTS["project_card"] }
  | { type: "project_column"; payload: WEBHOOK_EVENTS["project_column"] }
  | { type: "projects_v2"; payload: WEBHOOK_EVENTS["projects_v2"] }
  | { type: "projects_v2_item"; payload: WEBHOOK_EVENTS["projects_v2_item"] }
  | { type: "projects_v2_status_update"; payload: WEBHOOK_EVENTS["projects_v2_status_update"] }
  | { type: "public"; payload: WEBHOOK_EVENTS["public"] }
  | { type: "pull_request"; payload: WEBHOOK_EVENTS["pull_request"] }
  | { type: "pull_request_review"; payload: WEBHOOK_EVENTS["pull_request_review"] }
  | { type: "pull_request_review_comment"; payload: WEBHOOK_EVENTS["pull_request_review_comment"] }
  | { type: "pull_request_review_thread"; payload: WEBHOOK_EVENTS["pull_request_review_thread"] }
  | { type: "push"; payload: WEBHOOK_EVENTS["push"] }
  | { type: "registry_package"; payload: WEBHOOK_EVENTS["registry_package"] }
  | { type: "release"; payload: WEBHOOK_EVENTS["release"] }
  | { type: "repository"; payload: WEBHOOK_EVENTS["repository"] }
  | { type: "repository_advisory"; payload: WEBHOOK_EVENTS["repository_advisory"] }
  | { type: "repository_dispatch"; payload: WEBHOOK_EVENTS["repository_dispatch"] }
  | { type: "repository_import"; payload: WEBHOOK_EVENTS["repository_import"] }
  | { type: "repository_ruleset"; payload: WEBHOOK_EVENTS["repository_ruleset"] }
  | {
      type: "repository_vulnerability_alert";
      payload: WEBHOOK_EVENTS["repository_vulnerability_alert"];
    }
  | { type: "secret_scanning_alert"; payload: WEBHOOK_EVENTS["secret_scanning_alert"] }
  | {
      type: "secret_scanning_alert_location";
      payload: WEBHOOK_EVENTS["secret_scanning_alert_location"];
    }
  | { type: "secret_scanning_scan"; payload: WEBHOOK_EVENTS["secret_scanning_scan"] }
  | { type: "security_advisory"; payload: WEBHOOK_EVENTS["security_advisory"] }
  | { type: "security_and_analysis"; payload: WEBHOOK_EVENTS["security_and_analysis"] }
  | { type: "sponsorship"; payload: WEBHOOK_EVENTS["sponsorship"] }
  | { type: "star"; payload: WEBHOOK_EVENTS["star"] }
  | { type: "status"; payload: WEBHOOK_EVENTS["status"] }
  | { type: "sub_issues"; payload: WEBHOOK_EVENTS["sub_issues"] }
  | { type: "team"; payload: WEBHOOK_EVENTS["team"] }
  | { type: "team_add"; payload: WEBHOOK_EVENTS["team_add"] }
  | { type: "watch"; payload: WEBHOOK_EVENTS["watch"] }
  | { type: "workflow_dispatch"; payload: WEBHOOK_EVENTS["workflow_dispatch"] }
  | { type: "workflow_job"; payload: WEBHOOK_EVENTS["workflow_job"] }
  | { type: "workflow_run"; payload: WEBHOOK_EVENTS["workflow_run"] };
