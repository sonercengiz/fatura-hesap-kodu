import { render } from 'preact';
import { App } from './ui/App';
import { init, ready } from './ui/state';

render(<App />, document.getElementById('app')!);
init().catch((e) => console.error(e)).finally(() => { ready.value = true; });
