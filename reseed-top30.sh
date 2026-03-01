#!/bin/bash
# Re-seed Top 30 Texas counties before Election Day
# Usage: ADMIN_SECRET=your_secret ./reseed-top30.sh

SECRET="${ADMIN_SECRET:?Set ADMIN_SECRET environment variable}"
BASE="https://txvotes.app/api/election/seed-county"
LOG="reseed-$(date +%Y%m%d-%H%M%S).log"

declare -a COUNTIES=(
  "48201:Harris"
  "48113:Dallas"
  "48439:Tarrant"
  "48029:Bexar"
  "48453:Travis"
  "48085:Collin"
  "48121:Denton"
  "48215:Hidalgo"
  "48157:Fort Bend"
  "48491:Williamson"
  "48339:Montgomery"
  "48141:El Paso"
  "48355:Nueces"
  "48167:Galveston"
  "48039:Brazoria"
  "48257:Kaufman"
  "48251:Johnson"
  "48367:Parker"
  "48303:Lubbock"
  "48061:Cameron"
  "48309:McLennan"
  "48027:Bell"
  "48183:Gregg"
  "48381:Randall"
  "48375:Potter"
  "48423:Smith"
  "48469:Victoria"
  "48245:Jefferson"
  "48329:Midland"
  "48135:Ector"
)

echo "Starting county re-seed at $(date)" | tee "$LOG"
echo "Logging to $LOG"
echo ""

TOTAL=${#COUNTIES[@]}
SUCCESS=0
FAIL=0

for i in "${!COUNTIES[@]}"; do
  entry="${COUNTIES[$i]}"
  FIPS="${entry%%:*}"
  NAME="${entry#*:}"
  NUM=$((i + 1))

  echo "[$NUM/$TOTAL] Seeding $NAME County ($FIPS)..." | tee -a "$LOG"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE" \
    -H "Authorization: Bearer $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"countyFips\":\"$FIPS\",\"countyName\":\"$NAME\",\"reset\":true}" \
    --max-time 300)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "200" ]; then
    ERRORS=$(echo "$BODY" | jq -r '.summary.errored // "?"')
    COMPLETED=$(echo "$BODY" | jq -r '.summary.completed // "?"')
    echo "  OK (completed: $COMPLETED, errors: $ERRORS)" | tee -a "$LOG"
    if [ "$ERRORS" = "0" ]; then
      SUCCESS=$((SUCCESS + 1))
    else
      FAIL=$((FAIL + 1))
      echo "  Error details: $(echo "$BODY" | jq -c '.errors')" | tee -a "$LOG"
    fi
  else
    FAIL=$((FAIL + 1))
    echo "  FAILED (HTTP $HTTP_CODE): $BODY" | tee -a "$LOG"
  fi

  echo "$BODY" >> "$LOG"
  echo "" | tee -a "$LOG"

  # Wait between counties to avoid rate limits
  if [ $NUM -lt $TOTAL ]; then
    echo "  Waiting 15s..." | tee -a "$LOG"
    sleep 15
  fi
done

echo "============================" | tee -a "$LOG"
echo "Done at $(date)" | tee -a "$LOG"
echo "Success: $SUCCESS / $TOTAL" | tee -a "$LOG"
echo "Failed:  $FAIL / $TOTAL" | tee -a "$LOG"
