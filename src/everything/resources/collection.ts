/**
 * Demonstrates resource collections - returning multiple ResourceContents
 * with different URIs from a single resources/read request.
 *
 * Patterns shown:
 * - `demo://collection/summer-specials`: Returns all items as separate resources
 * - `demo://collection/by-category/{category}`: Returns items filtered by category
 * - `demo://collection/item/{id}`: Returns a single item (for individual access)
 *
 * See: https://github.com/orgs/modelcontextprotocol/discussions/648
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Sample collection data
const collectionItems = [
  { id: 1, name: "Summer Hat", price: 29.99, category: "accessories" },
  { id: 2, name: "Beach Towel", price: 19.99, category: "accessories" },
  { id: 3, name: "Sunglasses", price: 49.99, category: "accessories" },
  { id: 4, name: "Flip Flops", price: 14.99, category: "footwear" },
  { id: 5, name: "Sunscreen SPF50", price: 12.99, category: "skincare" },
];

const collectionUriBase = "demo://collection";
const itemUriBase = "demo://collection/item";
const itemUri = (id: number) => `${itemUriBase}/${id}`;

/**
 * Registers collection resources demonstrating the pattern where a single
 * resources/read request returns multiple ResourceContents with different URIs.
 *
 * This is useful for:
 * - Modeling collections, indexes, or composite resources
 * - Returning related items that can be individually addressed
 * - Category/filter-based resource access
 *
 * @param server - The McpServer instance
 */
export const registerCollectionResources = (server: McpServer) => {
  // 1. Main collection - returns ALL items, each with its own URI
  server.registerResource(
    "Summer Specials Collection",
    `${collectionUriBase}/summer-specials`,
    {
      mimeType: "application/json",
      description:
        "A collection resource that returns multiple items, each with its own URI",
    },
    async () => {
      return {
        contents: collectionItems.map((item) => ({
          uri: itemUri(item.id),
          mimeType: "application/json",
          text: JSON.stringify(item, null, 2),
        })),
      };
    }
  );

  // 2. Category-filtered collections - one resource per category
  const categories = [...new Set(collectionItems.map((i) => i.category))];

  for (const category of categories) {
    server.registerResource(
      `Collection: ${category}`,
      `${collectionUriBase}/by-category/${category}`,
      {
        mimeType: "application/json",
        description: `Items in the "${category}" category`,
      },
      async () => {
        const filtered = collectionItems.filter((i) => i.category === category);
        return {
          contents: filtered.map((item) => ({
            uri: itemUri(item.id),
            mimeType: "application/json",
            text: JSON.stringify(item, null, 2),
          })),
        };
      }
    );
  }

  // 3. Individual item resources - for direct access to single items
  for (const item of collectionItems) {
    server.registerResource(
      `Item: ${item.name}`,
      itemUri(item.id),
      {
        mimeType: "application/json",
        description: `Individual item: ${item.name} ($${item.price})`,
      },
      async (uri) => {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify(item, null, 2),
            },
          ],
        };
      }
    );
  }
};
