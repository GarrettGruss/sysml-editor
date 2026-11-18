export const VERSION = "0.3.0";

export const MAIN_HELP = `sysml ${VERSION}: command line tool for the SysML Editor

USAGE
  sysml <command> [options]
  sysml -h | --help
  sysml -V | --version

COMMANDS
  skills    Install the Claude agent skills (sysml-modeling, sysml-tutor, sysml-ui-testing)
  help      Show help for a command

OPTIONS
  -h, --help       Show this help and exit
  -V, --version    Print the version and exit

EXAMPLES
  sysml skills                 Install the skills for your user (~/.claude/skills)
  sysml skills -p              Install them into the current project (./.claude/skills)
  sysml help skills            Show the help of the skills command
  sysml --version              Print the version

Run 'sysml help <command>' for the options of a command.
Exit status: 0 success, 1 failure, 2 usage error.
`;

export const SKILLS_HELP = `sysml skills: install the Claude agent skills

USAGE
  sysml skills [-p | -d DIR] [-f] [-n] [-q | -v]

  Copies the skills sysml-modeling, sysml-tutor and sysml-ui-testing into a
  Claude skills folder. A skill that is already installed and identical is
  skipped. A skill that differs is refused unless -f is given.

OPTIONS
  -p, --project      Install into ./.claude/skills instead of ~/.claude/skills
  -d, --dir=DIR      Install into DIR (each skill becomes DIR/<name>)
  -f, --force        Overwrite skills that differ from the bundled ones
  -n, --dry-run      Show what would be done without changing anything
  -q, --quiet        Print nothing, not even with -v
  -v, --verbose      Print one line per skill
  -h, --help         Show this help and exit
  --                 End of options

EXAMPLES
  sysml skills                       Install for your user
  sysml skills -p                    Install into the current project
  sysml skills -pf                   Project install, overwriting changed skills
  sysml skills -n -v                 Show what would happen
  sysml skills -d ~/work/skills      Install into a custom folder
  sysml skills --dir=./skills -v     Same, with the long option
`;

export function helpFor(cmd: string | undefined): string | undefined {
  if (cmd === undefined) return MAIN_HELP;
  if (cmd === "skills") return SKILLS_HELP;
  return undefined;
}
