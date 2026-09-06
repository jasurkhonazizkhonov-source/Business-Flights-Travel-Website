import { domAnimation } from "framer-motion";

// Split into its own module so MotionProvider can reference it via a
// dynamic import() — that's what tells the bundler to fetch this as a
// separate, non-blocking chunk instead of folding it into the main bundle.
export default domAnimation;
