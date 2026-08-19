/**
 * Canonical Transcript & Timestamp Synchronization Utilities.
 *
 * ONE CANONICAL TIMELINE:
 * Word View → Caption View → Scene View → Timeline Tracks → Preview + FFmpeg Export
 *
 * All functions operate strictly on canonical Whisper word timestamps (seconds).
 */

export function segmentTranscriptIntoScenes(words = []) {
  if (!words || !words.length) return []

  const scenes = []
  let currentWords = []

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (!w || !w.word) continue
    currentWords.push(w)

    const wordStr = String(w.word || '').trim()
    const endsSentence = /[.!?…]$/.test(wordStr) || wordStr.endsWith('...')

    let hasSilenceAfter = false
    if (i < words.length - 1) {
      const nextStart = Number(words[i + 1].start || 0)
      const curEnd = Number(w.end || 0)
      if (nextStart - curEnd >= 0.45) {
        hasSilenceAfter = true
      }
    }

    const isTooLong = currentWords.length >= 14

    if (endsSentence || hasSilenceAfter || isTooLong || i === words.length - 1) {
      if (currentWords.length > 0) {
        const start = Number(Number(currentWords[0].start).toFixed(3))
        const end = Number(Number(currentWords[currentWords.length - 1].end).toFixed(3))
        scenes.push({
          id: `scene_${scenes.length}`,
          start,
          end,
          text: currentWords.map((item) => String(item.word || '').trim()).join(' '),
          words: currentWords,
        })
        currentWords = []
      }
    }
  }

  return scenes
}

export function splitCaptionAtWord(item, wordIndex, transcriptWords = []) {
  const words = item.words && item.words.length
    ? item.words
    : (transcriptWords.length
        ? transcriptWords.filter((w) => w.start >= item.start - 0.05 && w.end <= item.start + item.duration + 0.05)
        : (item.text || '').split(' ').map((w, idx) => {
            const step = item.duration / Math.max(1, (item.text || '').split(' ').length)
            return {
              word: w,
              start: Number((item.start + idx * step).toFixed(3)),
              end: Number((item.start + (idx + 1) * step).toFixed(3)),
            }
          }))

  if (!words || wordIndex <= 0 || wordIndex >= words.length) return null

  const firstWords = words.slice(0, wordIndex)
  const secondWords = words.slice(wordIndex)

  const firstStart = Number(firstWords[0].start.toFixed(3))
  const firstEnd = Number(firstWords[firstWords.length - 1].end.toFixed(3))
  const firstDuration = Math.max(0.1, Number((firstEnd - firstStart).toFixed(3)))

  const secondStart = Number(secondWords[0].start.toFixed(3))
  const secondEnd = Number(secondWords[secondWords.length - 1].end.toFixed(3))
  const secondDuration = Math.max(0.1, Number((secondEnd - secondStart).toFixed(3)))

  const firstItem = {
    ...item,
    text: firstWords.map((w) => w.word).join(' '),
    start: firstStart,
    duration: firstDuration,
    words: firstWords,
  }

  const secondItem = {
    ...item,
    id: `cap_${Math.random().toString(36).slice(2, 9)}`,
    text: secondWords.map((w) => w.word).join(' '),
    start: secondStart,
    duration: secondDuration,
    words: secondWords,
  }

  return [firstItem, secondItem]
}

export function mergeCaptionItems(firstItem, secondItem) {
  const mergedWords = [...(firstItem.words || []), ...(secondItem.words || [])]
  const mergedText = `${firstItem.text || ''} ${secondItem.text || ''}`.trim()
  const start = firstItem.start
  const end = Math.max(firstItem.start + firstItem.duration, secondItem.start + secondItem.duration)
  const duration = Math.max(0.1, Number((end - start).toFixed(3)))

  return {
    ...firstItem,
    text: mergedText,
    start,
    duration,
    words: mergedWords.length ? mergedWords : undefined,
  }
}
