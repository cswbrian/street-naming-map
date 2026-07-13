import { useLocale } from '../i18n/LocaleContext'
import { translations } from '../i18n/translations.js'

function RecordsFlowIntro() {
  const { locale } = useLocale()
  const steps =
    translations[locale]?.recordsSubtitleSteps ?? translations.en.recordsSubtitleSteps ?? []

  return (
    <ol className="link-queue-intro records-subtitle records-flow-steps">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  )
}

export default RecordsFlowIntro
