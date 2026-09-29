/** Symbols of the quick reactions (A1), shared by the summary in the card header and the picker */
import Beer from "@lucide/svelte/icons/beer";
import Brain from "@lucide/svelte/icons/brain";
import Cake from "@lucide/svelte/icons/cake";
import Check from "@lucide/svelte/icons/check";
import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
import Coffee from "@lucide/svelte/icons/coffee";
import Eye from "@lucide/svelte/icons/eye";
import FaceGrinning from "@lucide/svelte/icons/face-grinning";
import FaceSlightlyFrowning from "@lucide/svelte/icons/face-slightly-frowning";
import Handshake from "@lucide/svelte/icons/handshake";
import Hourglass from "@lucide/svelte/icons/hourglass";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import PartyPopper from "@lucide/svelte/icons/party-popper";
import Pin from "@lucide/svelte/icons/pin";
import Rocket from "@lucide/svelte/icons/rocket";
import ThumbsDown from "@lucide/svelte/icons/thumbs-down";
import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import Wine from "@lucide/svelte/icons/wine";
import type { ReactionKind } from "@ruumble/protocol";

// Lucide has no thinking face, clapping hands or champagne glasses: brain, party popper and a glass stand in
export const REACTION_ICONS = {
  agree: ThumbsUp, disagree: ThumbsDown, looking: Eye, thinking: Brain, wait: Hourglass, done: Check, broken: TriangleAlert,
  unclear: CircleQuestionMark, important: Pin, idea: Lightbulb, release: Rocket, deal: Handshake,
  happy: FaceGrinning, sad: FaceSlightlyFrowning, applause: PartyPopper, congrats: Wine, birthday: Cake, break: Coffee, cheers: Beer,
} satisfies Record<ReactionKind, unknown>;
