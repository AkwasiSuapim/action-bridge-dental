#!/usr/bin/env bash
# Live smoke test for a deployed stack. Creates (or refreshes) two synthetic Cognito users with
# fresh random passwords that are never printed or stored, signs them in, and runs
# backend/scripts/smoke.mjs against the stack's ApiBaseUrl.
#
#   bash infra/scripts/smoke-aws.sh
#   STACK=actionbridge-dental-demo bash infra/scripts/smoke-aws.sh
set -euo pipefail

STACK=${STACK:-actionbridge-dental-dev}
PROFILE=${AWS_PROFILE_NAME:-actionbridge}
REGION=${AWS_REGION_NAME:-us-east-2}

aws_() { aws --profile "$PROFILE" --region "$REGION" "$@"; }
output() {
  aws_ cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

POOL=$(output UserPoolId)
CLIENT=$(output UserPoolClientId)
API=$(output ApiBaseUrl)

token_for() {
  local email=$1 password
  password=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url') + 'Aa1')")
  if ! aws_ cognito-idp admin-get-user --user-pool-id "$POOL" --username "$email" >/dev/null 2>&1; then
    aws_ cognito-idp admin-create-user --user-pool-id "$POOL" --username "$email" --message-action SUPPRESS \
      --user-attributes Name=email,Value="$email" Name=email_verified,Value=true >/dev/null
  fi
  aws_ cognito-idp admin-set-user-password --user-pool-id "$POOL" --username "$email" --password "$password" --permanent
  aws_ cognito-idp initiate-auth --client-id "$CLIENT" --auth-flow USER_PASSWORD_AUTH \
    --auth-parameters USERNAME="$email",PASSWORD="$password" \
    --query AuthenticationResult.AccessToken --output text
}

SMOKE_BEARER_TOKEN=$(token_for smoke-a@example.com)
SMOKE_OTHER_BEARER_TOKEN=$(token_for smoke-b@example.com)
export SMOKE_BEARER_TOKEN SMOKE_OTHER_BEARER_TOKEN

echo "Smoke testing $API (stack $STACK)"
API_BASE_URL="$API" node "$(dirname "$0")/../../backend/scripts/smoke.mjs"
