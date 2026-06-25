import { setDefaultResultOrder } from "dns";

// This server's IPv6 range is globally blocked by Wikimedia as an abused
// webhost/proxy range (the IPv4 address isn't). Outbound requests to
// commons.wikimedia.org/wikidata.org/meta.wikimedia.org must resolve to the
// IPv4 address or every write silently fails with a block message.
export function register() {
  if (process.env.NEXT_RUNTIME !== "edge") {
    setDefaultResultOrder("ipv4first");
  }
}
