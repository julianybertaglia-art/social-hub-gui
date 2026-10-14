'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../WorkspaceSwitcher';

export default function CreatePostPage() {
  const [workspace] = useWorkspace();
  const frame = useRef(null);
  const [height, setHeight] = useState(1250);

  useEffect(() => {
    const sendWorkspace = () => frame.current?.contentWindow?.postMessage(
      { type: 'tideplace:workspace', workspace: workspace.id }, window.location.origin,
    );
    function receive(event) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'tideplace:creator-ready') sendWorkspace();
      if (event.data?.type === 'tideplace:creator-height' && Number.isFinite(event.data.height)) {
        setHeight(Math.max(700, Math.min(8000, event.data.height + 15)));
      }
    }
    window.addEventListener('message', receive);
    sendWorkspace();
    return () => window.removeEventListener('message', receive);
  }, [workspace.id]);

  return <iframe ref={frame} src="/criador-posts.html?embedded=1" title={`Editor de carrosséis · ${workspace.name}`}
    style={{ width: '100%', height, display: 'block', border: 0, background: 'transparent' }} />;
}
