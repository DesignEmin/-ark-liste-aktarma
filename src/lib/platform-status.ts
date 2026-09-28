import type { AdapterCapabilities } from "@/lib/adapters/types";
import type { PlatformId } from "@/lib/types";

/** /api/auth/status yanıtındaki platform bilgisi (istemciyle paylaşılır, sır içermez). */
export interface PlatformStatus {
  id: PlatformId;
  name: string;
  configured: boolean;
  connected: boolean;
  userName?: string;
  capabilities: AdapterCapabilities;
}
