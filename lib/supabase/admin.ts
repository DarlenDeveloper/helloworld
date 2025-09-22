import { createClient } from "@supabase/supabase-js"

export function createAdminClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
	if (!url || !serviceRoleKey) {
		throw new Error("Supabase admin client missing URL or service role key")
	}
	return createClient(url, serviceRoleKey)
}
