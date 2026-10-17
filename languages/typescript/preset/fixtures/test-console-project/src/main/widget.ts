export function mount(): { unmount(): void } {
  let mounted = true;
  const timer = setTimeout(() => {
    if (!mounted) {
      console.error('Warning: state update on an unmounted component');
    }
  }, 10);
  return {
    unmount() {
      mounted = false;
      clearTimeout(timer);
    },
  };
}
