// A small spinning ring. It is only decoration: the words next to it (for
// example "Logging in...") say what is happening, so screen readers skip it.
// It takes the colour of the text around it. The look is in `.spinner` in
// `index.css`.
export default function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
