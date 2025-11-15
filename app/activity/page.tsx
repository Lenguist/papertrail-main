'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseBrowserClient'

type Post = {
  id: string
  user_id: string
  type: 'user_joined' | 'added_to_shelf' | 'status_changed' | 'followed'
  openalex_id: string | null
  status: 'to_read' | 'reading' | 'read' | null
  target_user_id: string | null
  created_at: string
}

type ActivityEvent = {
  id: string
  user_id: string
  type: 'post_liked' | 'user_followed'
  post_id: string | null
  created_at: string
}

export default function ActivityPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [posts, setPosts] = useState<Record<string, any>>({})
  const [papers, setPapers] = useState<Record<string, any>>({})
  const [profiles, setProfiles] = useState<Record<string, { username: string | null; display_name: string | null; avatar_url: string | null }>>({})
  const [loading, setLoading] = useState(true)
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    const init = async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      if (!data.session) {
        router.push('/auth')
        return
      }
      setSession(data.session)
      
      // Get all posts by current user
      const myPostsRes = await supabaseBrowser
        .from('posts')
        .select('id')
        .eq('user_id', data.session.user.id)
      const myPostIds = (myPostsRes.data ?? []).map((p: any) => p.id)
      
      // Get likes on my posts - using distinct on to get only one per user per post
      const likesRes = await supabaseBrowser
        .from('post_likes')
        .select('user_id,post_id,created_at')
        .in('post_id', myPostIds)
        .order('user_id,post_id,created_at', { ascending: false })
        .limit(1000)  // safety limit
      
      const likes = (likesRes.data ?? []) as any[]
      
      // Deduplicate in frontend: keep only the first (most recent) per user-post combo
      const seen = new Set<string>()
      const uniqueLikes = likes.filter((like) => {
        const key = `${like.user_id}-${like.post_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      
      // Get follows of me
      const followsRes = await supabaseBrowser
        .from('follows')
        .select('follower_id,created_at')
        .eq('following_id', data.session.user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      
      const follows = (followsRes.data ?? []) as any[]
      
      // Combine and get unique user IDs
      const userIds = Array.from(new Set([
        ...uniqueLikes.map((l) => l.user_id),
        ...follows.map((f) => f.follower_id),
      ])) as string[]
      
      // Get profiles for these users
      if (userIds.length > 0) {
        const profRes = await supabaseBrowser.from('profiles').select('id,username,display_name,avatar_url').in('id', userIds)
        if (!profRes.error) {
          const map: any = {}
          for (const r of profRes.data as any[]) map[r.id] = { username: r.username, display_name: r.display_name, avatar_url: r.avatar_url }
          setProfiles(map)
        }
      }
      
      // Get post details for liked posts
      const postsMap: Record<string, any> = {}
      if (myPostIds.length > 0) {
        const postsRes = await supabaseBrowser
          .from('posts')
          .select('id,openalex_id,status')
          .in('id', myPostIds)
        
        if (!postsRes.error) {
          for (const p of postsRes.data as any[]) postsMap[p.id] = p
          setPosts(postsMap)
          
          // Get papers for these posts
          const openIds = Array.from(new Set((postsRes.data as any[]).map((p) => p.openalex_id).filter(Boolean))) as string[]
          if (openIds.length > 0) {
            const papRes = await supabaseBrowser.from('papers').select('*').in('openalex_id', openIds)
            if (!papRes.error) {
              const paperMap: any = {}
              for (const r of papRes.data as any[]) paperMap[r.openalex_id] = r
              setPapers(paperMap)
            }
          }
        }
      }
      
      // Store the activity events with post data for paper lookup
      const events = [
        ...uniqueLikes.map((l) => ({ type: 'post_liked' as const, user_id: l.user_id, post_id: l.post_id, post: postsMap[l.post_id], created_at: l.created_at })),
        ...follows.map((f) => ({ type: 'user_followed' as const, user_id: f.follower_id, post_id: null, post: null, created_at: f.created_at })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setEvents(events)
      
      setLoading(false)
    }
    init()
  }, [router])

  if (!session || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-gray-700 dark:text-gray-200">{loading ? 'Loading…' : 'Redirecting…'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">Activity</h1>
      {events.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => {
            const user = profiles[e.user_id]
            const name = user?.display_name || user?.username || e.user_id
            const action = e.type === 'post_liked' ? 'added brain to your post' : e.type === 'user_followed' ? 'followed you' : ''
            
            // Get the correct paper for this post
            const paper = e.post && e.post.openalex_id ? papers[e.post.openalex_id] : null
            
            return (
              <li key={`${e.type}-${e.user_id}-${e.created_at}`} className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                <div className="mb-2 flex items-center gap-3">
                  <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <a href={`/u/${user?.username ?? ''}`} className="font-medium text-gray-900 hover:underline dark:text-white">
                      {name}
                    </a>{' '}
                    {action}
                  </div>
                </div>
                {e.post_id && e.type === 'post_liked' && paper && (
                  <>
                    <div>
                      {paper.url && (
                        <a
                          href={paper.url}
                          target="_blank"
                          rel="noreferrer"
                          className="float-left text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 mr-2"
                          title="Open paper"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      <div className="font-medium text-gray-900 dark:text-white">{paper.title}</div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {expandedAuthors.has(e.post_id) ? (
                        <div>
                          {(paper.authors_json ?? []).join(', ')}
                          {(paper.authors_json ?? []).length > 12 && (
                            <button
                              onClick={() => setExpandedAuthors(prev => {
                                const next = new Set(prev)
                                next.delete(e.post_id)
                                return next
                              })}
                              className="ml-2 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                            >
                              collapse
                            </button>
                          )}
                        </div>
                      ) : (paper.authors_json ?? []).length > 12 ? (
                        <div>
                          {(paper.authors_json ?? []).slice(0, 12).join(', ')}...
                          <button
                            onClick={() => setExpandedAuthors(prev => new Set(prev).add(e.post_id))}
                            className="ml-2 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                          >
                            expand
                          </button>
                        </div>
                      ) : (
                        <div>
                          {(paper.authors_json ?? []).join(', ')}
                        </div>
                      )}
                    </div>
                    {paper.year && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Date published: {paper.year}
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}


