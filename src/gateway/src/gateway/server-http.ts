import { handleLemonSqueezyHttpRequest } from "./lemonsqueezy-http.js";
if (await handleN8nHttpRequest(req, res)) {
  return;
}
if (await handleLemonSqueezyHttpRequest(req, res)) {
  return;
}
