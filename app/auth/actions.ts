'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { authSchema } from '@/lib/validation'

export async function signIn(formData: FormData) {
  const result = authSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!result.success) {
    redirect(`/login?error=${encodeURIComponent(result.error.issues[0].message)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(result.data)

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signUp(formData: FormData) {
  const result = authSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!result.success) {
    redirect(`/login?error=${encodeURIComponent(result.error.issues[0].message)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp(result.data)

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  // Supabase側で「メール確認」を必須にしている場合、この時点ではまだログイン状態にならない。
  redirect(
    `/login?message=${encodeURIComponent('確認メールを送信しました。メール内のリンクを開いてください。')}`
  )
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
