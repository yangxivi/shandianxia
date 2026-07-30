// Node 20 及以下没有全局 WebSocket，而 @supabase/supabase-js 的实时库需要它。
// 必须在导入 supabase-js 之前执行（见 seed.mjs 顶部 import 顺序）。
import { WebSocket } from "ws";
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}
