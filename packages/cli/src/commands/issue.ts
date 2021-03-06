import { Command, CommanderStatic } from "commander";
import { client } from "../client";
import { issuePrompt, openPrompt, prompt, teamPrompt, titlePrompt } from "../prompts";
import { extraHelp } from "../shared";

const accumulateLabels = (label: string, previousLabels: string) =>
  Array.from(new Set((previousLabels || ([] as string[])).concat(label)));

const registerIssueOptions = (command: Command) =>
  command
    .option("-c, --create <title>", "create an issue")
    .option("-t, --team <team>", "team to create in or move to")
    .option("-e, --body <bodyText>", "set the description")
    .option("-s, --state <state>", "set the state")
    .option("-a, --assignee <user>", "add an assignee")
    .option("-p, --priority <priority>", "set the priority")
    .option("-l, --label <labelName>", "add a label", accumulateLabels)
    .option("-r, --rename <newTitle>", "rename the issue")
    .option("-E, --estimate <estimate>", "change the estimate")
    .option("-P, --project <project>", "set the project")
    .option("-C, --cycle <cycle>", "add to a cycle")
    .option("--archive", "archive this issue")
    .action(async (issueKey, cmd) => {
      let key = issueKey;
      const { archive, state, assignee, priority, label: labels, rename: renamedTitle, estimate, project, cycle } = cmd;
      let { team, create: newTitle } = cmd;

      if (key && !key.match(/[A-Za-z]+-\d+/)) {
        console.error(`Invalid issue key ${key} expected something like ABC-123\n`);
        cmd.outputHelp();
        process.exit(1);
      }
      if (!key && !newTitle) {
        const { action } = await prompt({
          type: "select",
          name: "action",
          message: "What would you like to do?",
          choices: [
            {
              message: "View or edit an issue",
              name: "get",
            },
            { message: "Create a new issue", name: "create" },
            { message: "Something else (shows help)", name: "help" },
          ],
        });
        switch (action) {
          case "get":
            console.log("find an issue...");
            const { teamKnown } = await prompt({
              type: "confirm",
              name: "teamKnown",
              message: "Do you know which team the issue belows to?",
            });
            if (teamKnown) {
              team = (await teamPrompt()).team;
            }
            key = (await issuePrompt(team)).issueKey;
            break;
          case "create":
            const { title } = await titlePrompt();
            newTitle = title;
            break;
          case "help":
            command.outputHelp();
          default:
            process.exit();
        }
      }
      if (archive && (!key || newTitle)) {
        console.error(`Can't archive issue without issueKey or while creating a new issue`);
        process.exit(1);
      }
      if (newTitle) {
        if (!team || team === "?") {
          team = (await teamPrompt()).team;
        }
        const {
          issueCreate: { issue },
        } = await client.issue.create({
          title: newTitle,
          team: { id: team },
        });
        await openPrompt(issue!.url);
      }
      if (state) {
        console.log("setting issue state to", state);
      }
      if (assignee) {
        console.log("setting assignee to", assignee);
      }
    })
    .on("--help", extraHelp);

export const register = (program: CommanderStatic) => {
  // @ts-ignore
  if (global.registerIssueGlobally) {
    registerIssueOptions(program.arguments("[issueKey]"));
  }
  registerIssueOptions(program.command("issue [issueKey]").description("View, create, or update an issue"));
};
