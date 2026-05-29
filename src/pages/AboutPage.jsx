import AppNav from '../components/AppNav'
import AppSiteTitle from '../components/AppSiteTitle'
import { useLocale } from '../i18n/LocaleContext'

const GITHUB_URL = 'https://github.com/cswbrian/street-naming-map'

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.02-1.3-.03-2.34-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.1-.78.42-1.31.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.53-1.52.12-3.18 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4 1.02 0 2.05.13 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.22.69.83.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function AboutPage() {
  const { t } = useLocale()

  return (
    <>
      <header className="app-page-header">
        <AppSiteTitle />
        <AppNav />
      </header>
      <article className="about-page">
        <header className="about-hero">
          <h1>{t('navAbout')}</h1>
          <p>{t('aboutIntro')}</p>
        </header>

        <section className="about-section">
          <h2>{t('aboutDataTitle')}</h2>
          <p>{t('aboutDataBody')}</p>
        </section>

        <section className="about-section about-open-source">
          <h2>{t('aboutOpenSourceTitle')}</h2>
          <p>{t('aboutOpenSourceBody')}</p>
          <div className="about-actions">
            <a
              className="contribute-primary-btn about-github-btn"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitHubIcon />
              {t('aboutGitHubCta')}
            </a>
          </div>
        </section>
      </article>
    </>
  )
}

export default AboutPage
