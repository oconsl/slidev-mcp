import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse, serialize, parseSlideInput } from "../lib/slides-parser.js";
import { DEFAULT_MERMAID_INIT } from "../lib/defaults.js";

/**
 * Tool: add_diagram
 *
 * Generates a Mermaid diagram inside a Slidev slide.
 *
 * Slidev natively supports Mermaid diagrams via code blocks:
 *   ```mermaid
 *   graph TD
 *       A --> B
 *   ```
 *
 * Supported diagram types (https://mermaid.js.org/intro/syntax-reference.html):
 *   - flowchart / graph      — Flowcharts and directed graphs
 *   - sequenceDiagram        — Sequence diagrams
 *   - classDiagram           — Class diagrams (UML)
 *   - stateDiagram-v2        — State machine diagrams
 *   - erDiagram              — Entity-relationship diagrams
 *   - gantt                  — Gantt charts
 *   - pie                    — Pie charts
 *   - journey                — User journey maps
 *   - gitGraph               — Git branching diagrams
 *   - mindmap                — Mind maps
 *   - timeline               — Timeline diagrams
 *   - quadrantChart          — Quadrant charts
 *   - xychart-beta           — XY charts (bar/line)
 *   - block-beta             — Block diagrams
 *   - packet-beta            — Packet diagrams (network)
 *   - architecture-beta      — Architecture diagrams
 *   - requirementDiagram     — Requirement diagrams
 *   - c4Context              — C4 context diagrams
 *   - sankey-beta            — Sankey flow diagrams
 *   - zenuml                 — ZenUML sequence diagrams
 */

/** All supported Mermaid diagram types */
const DIAGRAM_TYPES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "journey",
  "gitGraph",
  "mindmap",
  "timeline",
  "quadrantChart",
  "xychart-beta",
  "block-beta",
  "packet-beta",
  "architecture-beta",
  "requirementDiagram",
  "c4Context",
  "sankey-beta",
  "zenuml",
] as const;

type DiagramType = (typeof DIAGRAM_TYPES)[number];

/** Example Mermaid syntax for each diagram type */
const DIAGRAM_EXAMPLES: Record<DiagramType, string> = {
  flowchart: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,

  graph: `graph LR
    A[Client] --> B[Server]
    B --> C[(Database)]
    B --> D[Cache]`,

  sequenceDiagram: `sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: Great!
    Alice-)Bob: See you later!`,

  classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog {
        +fetch() void
    }
    Animal <|-- Dog`,

  "stateDiagram-v2": `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : start
    Processing --> Done : complete
    Processing --> Error : fail
    Done --> [*]
    Error --> Idle : retry`,

  erDiagram: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int orderId
        date createdAt
    }`,

  gantt: `gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Planning
    Requirements   :a1, 2024-01-01, 7d
    Design         :a2, after a1, 5d
    section Development
    Implementation :b1, after a2, 14d
    Testing        :b2, after b1, 7d`,

  pie: `pie title Distribution
    "Category A" : 40
    "Category B" : 35
    "Category C" : 25`,

  journey: `journey
    title User Onboarding Journey
    section Sign Up
      Visit landing page: 5: User
      Fill registration form: 3: User
      Verify email: 4: User, System
    section First Use
      Complete tutorial: 4: User
      Create first project: 5: User`,

  gitGraph: `gitGraph
    commit id: "init"
    branch feature
    checkout feature
    commit id: "add feature"
    commit id: "fix bug"
    checkout main
    merge feature id: "merge feature"
    commit id: "release v1.0"`,

  mindmap: `mindmap
  root((Project))
    Planning
      Requirements
      Timeline
      Resources
    Development
      Frontend
      Backend
      Database
    Testing
      Unit Tests
      Integration`,

  timeline: `timeline
    title Technology Timeline
    2020 : React 17
         : Node.js 14
    2021 : React 18 Beta
         : TypeScript 4.5
    2022 : React 18 Stable
         : Next.js 13
    2023 : React Server Components
         : Bun 1.0`,

  quadrantChart: `quadrantChart
    title Feature Prioritization
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Quick Wins
    quadrant-2 Major Projects
    quadrant-3 Fill-ins
    quadrant-4 Thankless Tasks
    Feature A: [0.3, 0.8]
    Feature B: [0.7, 0.9]
    Feature C: [0.2, 0.3]`,

  "xychart-beta": `xychart-beta
    title "Monthly Sales"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Revenue (USD)" 0 --> 10000
    bar [3500, 4200, 3800, 5100, 4700, 6200]
    line [3500, 4200, 3800, 5100, 4700, 6200]`,

  "block-beta": `block-beta
    columns 3
    A["Frontend"] B["API Gateway"] C["Backend"]
    D["CDN"] E["Load Balancer"] F["Database"]
    A --> B
    B --> C
    C --> F`,

  "packet-beta": `packet-beta
    title TCP Packet Structure
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
    64-95: "Acknowledgment Number"
    96-99: "Data Offset"
    100-105: "Reserved"`,

  "architecture-beta": `architecture-beta
    group api(cloud)[API]
    service db(database)[Database] in api
    service server(server)[Server] in api
    service storage(disk)[Storage]
    db:L -- R:server
    server:T -- B:storage`,

  requirementDiagram: `requirementDiagram
    requirement UserAuth {
        id: 1
        text: System must authenticate users
        risk: high
        verifymethod: test
    }
    element LoginComponent {
        type: component
    }
    LoginComponent - satisfies -> UserAuth`,

  c4Context: `C4Context
    title System Context Diagram
    Person(user, "User", "A system user")
    System(system, "Application", "Main application")
    System_Ext(email, "Email Service", "External email provider")
    Rel(user, system, "Uses")
    Rel(system, email, "Sends emails")`,

  "sankey-beta": `sankey-beta
    Agriculture,Electricity,24.3
    Agriculture,Heat,0.8
    Electricity,Residential,22.5
    Heat,Residential,4.1`,

  zenuml: `zenuml
    title Checkout Flow
    @Client
    @Server
    @DB
    Client -> Server: checkout(cart)
    Server -> DB: saveOrder(cart)
    DB --> Server: orderId
    Server --> Client: confirmation(orderId)`,
};

/** Validates that the diagram definition string is non-empty and reasonably structured */
function validateDiagramDefinition(
  diagramType: string,
  definition: string
): void {
  const trimmed = definition.trim();
  if (!trimmed) {
    throw new Error("Diagram definition must not be empty.");
  }
  if (trimmed.length > 50000) {
    throw new Error(
      "Diagram definition exceeds maximum length of 50,000 characters."
    );
  }
}

/**
 * Wraps a Mermaid diagram definition in a Slidev-compatible code block.
 * Optionally includes a title heading and layout frontmatter.
 */
function buildSlideContent(params: {
  diagramType: string;
  definition: string;
  title?: string;
  layout?: string;
  caption?: string;
}): string {
  const { definition, title, layout, caption } = params;

  const lines: string[] = [];

  // Per-slide frontmatter (layout)
  if (layout) {
    lines.push(`---`);
    lines.push(`layout: ${layout}`);
    lines.push(`---`);
    lines.push(``);
  }

  // Optional title heading
  if (title) {
    lines.push(`# ${title}`);
    lines.push(``);
  }

  // Mermaid code block
  lines.push("```mermaid");
  const trimmedDefinition = definition.trim();
  const withInit = trimmedDefinition.startsWith("%%{init:")
    ? trimmedDefinition
    : `${DEFAULT_MERMAID_INIT}\n${trimmedDefinition}`;
  lines.push(withInit);
  lines.push("```");

  // Optional caption below diagram
  if (caption) {
    lines.push(``);
    lines.push(`<p class="text-sm text-gray-500 text-center">${caption}</p>`);
  }

  return lines.join("\n");
}

const AddDiagramSchema = z.object({
  diagram_type: z
    .enum(DIAGRAM_TYPES)
    .describe(
      "Mermaid diagram type. Supported types:\n" +
        "  flowchart/graph      — Directed flowcharts and graphs\n" +
        "  sequenceDiagram      — Sequence/interaction diagrams\n" +
        "  classDiagram         — UML class diagrams\n" +
        "  stateDiagram-v2      — State machine diagrams\n" +
        "  erDiagram            — Entity-relationship diagrams\n" +
        "  gantt                — Project/schedule Gantt charts\n" +
        "  pie                  — Pie/donut charts\n" +
        "  journey              — User journey maps\n" +
        "  gitGraph             — Git branching history\n" +
        "  mindmap              — Mind maps\n" +
        "  timeline             — Timeline diagrams\n" +
        "  quadrantChart        — 2x2 quadrant analysis\n" +
        "  xychart-beta         — Bar/line XY charts\n" +
        "  block-beta           — Block/box diagrams\n" +
        "  packet-beta          — Network packet structure\n" +
        "  architecture-beta    — Cloud/system architecture\n" +
        "  requirementDiagram   — Requirements traceability\n" +
        "  c4Context            — C4 architecture context\n" +
        "  sankey-beta          — Sankey flow/energy diagrams\n" +
        "  zenuml               — ZenUML sequence diagrams\n" +
        "Reference: https://mermaid.js.org/intro/syntax-reference.html"
    ),

  definition: z
    .string()
    .min(1)
    .describe(
      "The Mermaid diagram definition. Do NOT include the opening diagram type keyword if it is " +
        "already captured by diagram_type — instead provide only the diagram body. However, " +
        "for diagram types like 'flowchart', 'graph', 'sequenceDiagram', etc. that require a " +
        "direction or keyword as the first line (e.g. 'flowchart TD' or 'sequenceDiagram'), " +
        "include the full definition starting from that keyword.\n\n" +
        "IMPORTANT: The tool wraps your definition in ```mermaid ... ``` automatically. " +
        "Do NOT add the code fence yourself.\n\n" +
        "Example for flowchart:\n" +
        "  flowchart TD\n" +
        "      A[Start] --> B{Decision}\n" +
        "      B -->|Yes| C[Result]\n\n" +
        "Example for sequenceDiagram:\n" +
        "  sequenceDiagram\n" +
        "      Alice->>Bob: Hello\n" +
        "      Bob-->>Alice: Hi!"
    ),

  title: z
    .string()
    .optional()
    .describe(
      "Optional slide heading (rendered as # heading above the diagram). " +
        "Leave empty to show only the diagram with no title."
    ),

  caption: z
    .string()
    .optional()
    .describe(
      "Optional caption displayed below the diagram in small gray text. " +
        "Useful for citing sources or adding brief notes."
    ),

  layout: z
    .string()
    .optional()
    .describe(
      "Slidev layout to apply to this slide (e.g. 'center', 'default', 'full'). " +
        "Defaults to 'default' if omitted."
    ),

  slide_number: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "If provided, REPLACES the existing slide at this 1-based position with the diagram slide. " +
        "If omitted, a new slide is APPENDED at the end of the presentation."
    ),

  index: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "If provided (and slide_number is not set), INSERTS the new diagram slide at this " +
        "1-based position. If both index and slide_number are omitted, appends at the end."
    ),
});

export function registerAddDiagram(server: McpServer): void {
  server.tool(
    "add_diagram",
    "Add a Mermaid diagram to a Slidev presentation slide. Supports all Mermaid diagram types " +
      "including flowcharts, sequence diagrams, class diagrams, ER diagrams, Gantt charts, " +
      "pie charts, git graphs, mind maps, timelines, and more. " +
      "The diagram is wrapped in a ```mermaid code block as required by Slidev. " +
      "Can append a new slide, insert at a position, or replace an existing slide. " +
      "Reference: https://mermaid.js.org/intro/syntax-reference.html",
    AddDiagramSchema.shape,
    async (params) => {
      const {
        diagram_type,
        definition,
        title,
        caption,
        layout,
        slide_number,
        index,
      } = params;

      // Resolve project path
      let projectPath: string;
      try {
        projectPath = getProjectPath();
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      // Validate diagram definition
      try {
        validateDiagramDefinition(diagram_type, definition);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const slidesPath = path.join(projectPath, "slides.md");

      try {
        const raw = fs.readFileSync(slidesPath, "utf8");
        const presentation = parse(raw);

        // Build the slide content with Mermaid code block
        const slideContent = buildSlideContent({
          diagramType: diagram_type,
          definition,
          title,
          caption,
          layout,
        });

        const parsedSlide = parseSlideInput(slideContent);

        let action: "replaced" | "inserted" | "appended";
        let finalPosition: number;

        if (slide_number !== undefined) {
          // REPLACE mode
          if (slide_number > presentation.slides.length) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Slide ${slide_number} does not exist. Presentation has ${presentation.slides.length} slides.`,
                },
              ],
              isError: true,
            };
          }
          presentation.slides[slide_number - 1] = parsedSlide;
          action = "replaced";
          finalPosition = slide_number;
        } else if (index !== undefined) {
          // INSERT mode
          if (index > presentation.slides.length + 1) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Index ${index} is out of range. Presentation has ${presentation.slides.length} slides.`,
                },
              ],
              isError: true,
            };
          }
          presentation.slides.splice(index - 1, 0, parsedSlide);
          action = "inserted";
          finalPosition = index;
        } else {
          // APPEND mode
          presentation.slides.push(parsedSlide);
          action = "appended";
          finalPosition = presentation.slides.length;
        }

        fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                action,
                diagramType: diagram_type,
                slideNumber: finalPosition,
                slideCount: presentation.slides.length,
                message:
                  action === "replaced"
                    ? `Slide ${finalPosition} replaced with a ${diagram_type} diagram.`
                    : action === "inserted"
                    ? `${diagram_type} diagram inserted at slide ${finalPosition}. Presentation now has ${presentation.slides.length} slides.`
                    : `${diagram_type} diagram appended as slide ${finalPosition}. Presentation now has ${presentation.slides.length} slides.`,
                tip: "Slidev renders Mermaid diagrams natively. If the diagram does not appear, ensure @slidev/plugin-mermaid or the built-in Mermaid support is active.",
                reference: "https://mermaid.js.org/intro/syntax-reference.html",
                exampleSyntax: DIAGRAM_EXAMPLES[diagram_type as DiagramType] ?? null,
              }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Returns example Mermaid syntax for a given diagram type.
 * Useful for AI agents that want to understand the syntax before generating.
 */
export { DIAGRAM_TYPES, DIAGRAM_EXAMPLES };
