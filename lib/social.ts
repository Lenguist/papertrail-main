'use client'

import { supabaseBrowser } from '@/lib/supabaseBrowserClient'

export type PublicProfile = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
}

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
  const res = await supabaseBrowser
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url')
    .ilike('username', username)
    .single()
  if (res.error) return null
  return res.data as unknown as PublicProfile
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    supabaseBrowser.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    supabaseBrowser.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ])
  return {
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  }
}

export async function isFollowing(targetUserId: string): Promise<boolean> {
  const { data: sessionData } = await supabaseBrowser.auth.getSession()
  const me = sessionData.session?.user
  if (!me) return false
  const res = await supabaseBrowser
    .from('follows')
    .select('follower_id')
    .eq('follower_id', me.id)
    .eq('following_id', targetUserId)
    .limit(1)
  return !!(res.data && res.data.length > 0)
}

export async function follow(targetUserId: string) {
  const { data: sessionData } = await supabaseBrowser.auth.getSession()
  const me = sessionData.session?.user
  if (!me) throw new Error('Not authenticated')
  const res = await supabaseBrowser.from('follows').insert([{ follower_id: me.id, following_id: targetUserId }])
  if (res.error && (res.error as any).code !== '23505') throw res.error
}

export async function unfollow(targetUserId: string) {
  const { data: sessionData } = await supabaseBrowser.auth.getSession()
  const me = sessionData.session?.user
  if (!me) throw new Error('Not authenticated')
  const res = await supabaseBrowser
    .from('follows')
    .delete()
    .match({ follower_id: me.id, following_id: targetUserId })
  if (res.error) throw res.error
}


