import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * service_role 키를 사용하는 관리자 전용 클라이언트.
 * RLS를 완전히 우회하므로 서버(Server Action/Server Component)에서만 사용하고
 * 클라이언트 컴포넌트로 절대 전달하지 않는다.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
