// Shared keyboard rule for the Vital WhatsApp composer.
// Enter sends, Shift+Enter inserts a newline. Never send during IME composition.
export function shouldSendOnEnter(event){
  return Boolean(event?.key==='Enter'
    && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
    && !event.repeat && !event.isComposing
    && !event.nativeEvent?.isComposing
    && event.nativeEvent?.keyCode!==229);
}
