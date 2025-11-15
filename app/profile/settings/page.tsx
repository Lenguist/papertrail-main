'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabaseBrowserClient'
import { ensureProfileForCurrentUser, fetchMyProfile, saveMyProfile } from '@/lib/profile'

export default function ProfileSettingsPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      if (!data.session) {
        router.push('/auth')
        return
      }
      setSession(data.session)
      await ensureProfileForCurrentUser()
      const p = await fetchMyProfile()
      if (p) {
        setUsername(p.username ?? '')
        setDisplayName(p.display_name ?? '')
        setBio(p.bio ?? '')
        setAvatarUrl(p.avatar_url ?? null)
      }
      setLoading(false)
    }
    init()
  }, [router])

  const usernameValid = useMemo(() => {
    if (!username) return true
    return /^[a-z0-9_.]{3,20}$/.test(username)
  }, [username])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    
    let finalAvatarUrl = avatarUrl
    
    // Upload avatar if a new file was selected
    if (avatarFile && session) {
      try {
        setUploading(true)
        const fileExt = avatarFile.name.split('.').pop()
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`
        const filePath = `avatars/${fileName}`
        
        const uploadRes = await supabaseBrowser.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: false })
        
        if (uploadRes.error) {
          setMessage(`Upload failed: ${uploadRes.error.message}`)
          setSaving(false)
          setUploading(false)
          return
        }
        
        // Get public URL
        const { data: urlData } = supabaseBrowser.storage
          .from('avatars')
          .getPublicUrl(filePath)
        
        finalAvatarUrl = urlData?.publicUrl ?? null
        setAvatarUrl(finalAvatarUrl)
        setAvatarFile(null)
      } catch (error: any) {
        setMessage(`Upload error: ${error.message}`)
        setSaving(false)
        setUploading(false)
        return
      }
    }
    
    const res = await saveMyProfile({
      username: username || null,
      display_name: displayName || null,
      bio: bio || null,
      avatar_url: finalAvatarUrl,
    })
    if (!res.ok) setMessage(res.message)
    else {
      setMessage('Saved!')
      setAvatarPreview(null)
      // Refresh avatar URL from database to ensure it's persisted
      setTimeout(async () => {
        const p = await fetchMyProfile()
        if (p) {
          setAvatarUrl(p.avatar_url ?? null)
        }
      }, 500)
    }
    setSaving(false)
    setUploading(false)
  }

  async function handleDeleteMyData() {
    if (!confirm('Delete your data (library, profile, posts, follows as follower) and sign out?')) return
    setSaving(true)
    try {
      const uid = session!.user.id
      // Delete my posts
      await supabaseBrowser.from('posts').delete().eq('user_id', uid)
      // Delete my library
      await supabaseBrowser.from('user_papers').delete().eq('user_id', uid)
      // Delete my follows where I am the follower
      await supabaseBrowser.from('follows').delete().eq('follower_id', uid)
      // Delete my profile
      await supabaseBrowser.from('profiles').delete().eq('id', uid)
      // Sign out
      await supabaseBrowser.auth.signOut()
      router.push('/auth')
    } catch (e: any) {
      setMessage(e?.message ?? 'Failed to delete data')
    } finally {
      setSaving(false)
    }
  }

  if (!session || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-gray-700 dark:text-gray-200">{loading ? 'Loading…' : 'Redirecting…'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>
      <div className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-zinc-800">
        <div>
          <label className="mb-1 block text-sm text-gray-700 dark:text-gray-300">Profile picture</label>
          <div className="flex items-center gap-4">
            {(avatarPreview || avatarUrl) && (
              <img
                src={avatarPreview || avatarUrl || ''}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover"
              />
            )}
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    const file = e.target.files[0]
                    setAvatarFile(file)
                    // Create preview
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      setAvatarPreview(event.target?.result as string)
                    }
                    reader.readAsDataURL(file)
                  }
                }}
                disabled={uploading || saving}
                className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 dark:file:bg-orange-900/20 dark:file:text-orange-300"
              />
              {avatarFile && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Selected: {avatarFile.name}
                </p>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-700 dark:text-gray-300">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="e.g. maksym_b"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-orange-600 focus:outline-none dark:border-gray-700 dark:bg-zinc-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            3–20 chars, lowercase letters, numbers, underscore, dot
          </p>
          {!usernameValid && (
            <p className="mt-1 text-sm text-red-600">Invalid username format.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-700 dark:text-gray-300">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-orange-600 focus:outline-none dark:border-gray-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-700 dark:text-gray-300">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short bio"
            className="min-h-24 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-orange-600 focus:outline-none dark:border-gray-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !usernameValid}
            className="btn-primary px-5 py-2"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {message && <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>}
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-red-300 p-4 dark:border-red-900/60">
        <h2 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          Delete your data (library, profile, posts, follows as follower) and sign out. This does not remove your Auth account; admin deletion is required to fully erase it.
        </p>
        <button
          onClick={handleDeleteMyData}
          disabled={saving}
          className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          {saving ? 'Deleting…' : 'Delete my data'}
        </button>
      </div>
    </div>
  )
}
