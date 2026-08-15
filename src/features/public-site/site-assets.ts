/*
 * Public-site imagery.
 *
 * The v7 build embedded these as base64 data URLs inside app.html, which made
 * the single file enormous. Here they are real files: Vite fingerprints them,
 * the browser caches them, and they stay out of AppState — siteContent carries
 * text and administrator uploads only.
 */

import cottonFlower from '../../assets/site/flower.png'
import demoPoster from '../../assets/site/demo-poster.jpg'
import heroDashboard from '../../assets/site/hero-dashboard.jpg'
import heroRegister from '../../assets/site/hero-register.jpg'
import heroReports from '../../assets/site/hero-reports.jpg'

export const siteAssets = {
  cottonFlower,
  demoPoster,
  heroDashboard,
  heroRegister,
  heroReports,
} as const
