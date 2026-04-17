import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolFactory,
} from "../../src/plugins/types.js";
import { createSearchAndBrowseTool } from "./src/search-and-browse-tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createSearchAndBrowseTool(api) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true },
  );
}
