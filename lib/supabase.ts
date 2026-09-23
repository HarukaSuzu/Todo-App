// service_roleキーはRow Level Securityをバイパスできる強力な鍵なので、
// NEXT_PUBLIC_ を付けずに（＝ブラウザ側のバンドルに含めずに）扱う。
// このアプリはServer Component / Server Actionsからしかこのファイルを
// importしていないので、ブラウザにこのキーが渡ることはない。
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env に設定してください。'
  )
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
