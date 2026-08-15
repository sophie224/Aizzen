import type { SiteContent } from '../../domain/types/index.ts'
import { siteAssets } from './site-assets.ts'
import { youTubeEmbedUrl } from './video-url.ts'

/*
 * Demo video frame.
 *
 * Three sources, in the order Website Administration offers them:
 *   1. `videoData` — a clip uploaded by the administrator (base64 in Phase 1)
 *   2. `videoUrl`  — a YouTube link, rendered as a privacy-basic embed
 *   3. neither     — the poster still, so the section never renders empty
 */

export interface SiteVideoProps {
  content: SiteContent
  title: string
}

export function SiteVideo({ content, title }: SiteVideoProps) {
  const embed = content.videoData ? '' : youTubeEmbedUrl(content.videoUrl)

  if (embed) {
    return (
      <div className="aizen-video-frame">
        <iframe
          src={embed}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  if (content.videoData) {
    return (
      <div className="aizen-video-frame">
        {/* Captions are administrator-supplied content and not modelled yet. */}
        <video
          key={content.videoData}
          controls
          playsInline
          preload="metadata"
          poster={siteAssets.demoPoster}
        >
          <source src={content.videoData} />
        </video>
      </div>
    )
  }

  return (
    <div className="aizen-video-frame">
      <img src={siteAssets.demoPoster} alt={title} />
    </div>
  )
}
