import React from 'react'

export function computeBaseVideoStyle({ activeSplitItem, zoomScale }) {
  if (activeSplitItem) {
    return {
      position: 'absolute',
      left: 0,
      top: activeSplitItem.layout === 'split_top' ? '50%' : '0%',
      width: '100%',
      height: '50%',
      objectFit: 'cover',
      transform: `scale(${zoomScale})`,
    }
  }

  return {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
    transform: `scale(${zoomScale})`,
  }
}

export default function SplitScreenLayout({ children, activeSplitItem, zoomScale }) {
  const style = computeBaseVideoStyle({ activeSplitItem, zoomScale })
  return React.cloneElement(children, { style })
}
