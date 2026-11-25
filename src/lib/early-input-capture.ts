// Text a visitor types (or a browser autofills) into the SERVER-RENDERED form before React has hydrated it used to vanish: the fields are controlled by useState("")
// and hydration writes that empty value back into the input. Measured on the production build: first and last name typed into /contact the moment the form appeared
// were both empty after hydration, with no CPU or network throttling at all; on a phone the window lasts seconds.
//
// This one small inline script (added to the root layout with the page's CSP nonce, `beforeInteractive`, so it runs before any hydration) remembers the value of every
// text field, text area and select by element id as the visitor edits it. A form then takes its own fields back with useAdoptEarlyInputs() right after it has hydrated.
// Nothing leaves the page and nothing is stored: it is an in-memory object that lives as long as the page does.
//
//  * password, checkbox, radio, file and hidden inputs are never recorded (nothing on this site needs them, and a password must never be copied around);
//  * once a form has taken its fields back (or declined to) the id is closed, so later typing is not recorded and cannot resurface in a form that mounts later.
export const EARLY_INPUT_CAPTURE_SCRIPT =
  "(function(){var w=window,s=w.__bftEarlyInputs={},c=w.__bftEarlyClosed={};" +
  "function r(e){var t=e.target;if(!t||!t.id||c[t.id])return;var n=t.tagName;if(n!=='INPUT'&&n!=='TEXTAREA'&&n!=='SELECT')return;" +
  "var y=(t.type||'').toLowerCase();if(y==='password'||y==='checkbox'||y==='radio'||y==='file'||y==='hidden')return;s[t.id]=t.value}" +
  "document.addEventListener('input',r,true);document.addEventListener('change',r,true)})();";
