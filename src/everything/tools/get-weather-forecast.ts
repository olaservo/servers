import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * SEP-834 Demo Tool: Weather Forecast (Raw Array Output)
 *
 * This tool directly matches the example from SEP-834's Motivation section.
 * It demonstrates returning a RAW ARRAY of hourly forecasts directly in
 * structuredContent - the key capability enabled by SEP-834.
 *
 * Before SEP-834:
 *   - outputSchema MUST have type: "object" at root
 *   - structuredContent MUST be wrapped: { "forecasts": [...] }
 *   - Adds unnecessary nesting, conflicts with common REST API patterns
 *
 * After SEP-834:
 *   - outputSchema can be type: "array" at root
 *   - structuredContent can be the array directly: [...]
 *   - Matches natural API patterns (AccuWeather, OpenWeather, etc.)
 */

// Hourly forecast schema - matches SEP-834 example exactly
const HourlyForecastSchema = z.object({
  hour: z.string().describe("Hour in HH:MM format"),
  temp: z.number().describe("Temperature in Fahrenheit"),
  conditions: z.string().describe("Weather conditions"),
});

// Mock forecast data - matches SEP-834 Motivation section example
const MOCK_FORECASTS = [
  { hour: "09:00", temp: 68, conditions: "sunny" },
  { hour: "10:00", temp: 72, conditions: "partly cloudy" },
  { hour: "11:00", temp: 75, conditions: "cloudy" },
  { hour: "12:00", temp: 78, conditions: "cloudy" },
  { hour: "13:00", temp: 80, conditions: "partly cloudy" },
  { hour: "14:00", temp: 82, conditions: "sunny" },
  { hour: "15:00", temp: 81, conditions: "sunny" },
  { hour: "16:00", temp: 79, conditions: "partly cloudy" },
];

// Tool input schema
const GetWeatherForecastInputSchema = {
  hours: z
    .number()
    .min(1)
    .max(24)
    .optional()
    .describe("Number of hourly forecasts to return (default: all available)"),
};

// SEP-834: Array schema at root level (not wrapped in object)
const GetWeatherForecastOutputSchema = z
  .array(HourlyForecastSchema)
  .describe("Array of hourly weather forecasts returned directly");

// Tool configuration
const name = "get-weather-forecast";
const config = {
  title: "Get Weather Forecast (SEP-834)",
  description:
    "Returns hourly weather forecasts as a RAW ARRAY. This matches the example from SEP-834's Motivation section, demonstrating why array outputs matter for real-world APIs.",
  inputSchema: GetWeatherForecastInputSchema,
  outputSchema: GetWeatherForecastOutputSchema,
};

/**
 * Registers the 'get-weather-forecast' tool.
 *
 * This tool demonstrates the primary use case from SEP-834:
 * returning array data directly without artificial wrapper objects.
 *
 * Compare:
 *   Before SEP-834: { "forecasts": [{ "hour": "09:00", ... }] }
 *   After SEP-834:  [{ "hour": "09:00", ... }]
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetWeatherForecastTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const hours = args.hours ?? MOCK_FORECASTS.length;
    const forecasts = MOCK_FORECASTS.slice(0, hours);

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: JSON.stringify(forecasts, null, 2),
    };

    // SEP-834: Return the array DIRECTLY, not wrapped in { forecasts: [...] }
    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: forecasts,
    };
  });
};
