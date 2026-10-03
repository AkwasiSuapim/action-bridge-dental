#!/usr/bin/env bash
# Creates a Cognito demo login for a teammate (synthetic data only). Requires the AWS profile.
# Prints a ONE-TIME temporary password: the app asks for a new password at first sign-in.
# Share it privately (never commit it or post it in a public channel).
#
#   bash infra/scripts/create-demo-user.sh teammate.demo@example.com
#   bash infra/scripts/create-demo-user.sh teammate.demo@example.com --reset   # new temporary password
set -euo pipefail

EMAIL=${1:?Usage: create-demo-user.sh <email> [--reset]}
RESET=${2:-}
STACK=${STACK:-actionbridge-dental-dev}
PROFILE=${AWS_PROFILE_NAME:-actionbridge}
REGION=${AWS_REGION_NAME:-us-east-2}

aws_() { aws --profile "$PROFILE" --region "$REGION" "$@"; }
POOL=$(aws_ cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
TEMP="Temp-$(node -e "process.stdout.write(require('crypto').randomBytes(6).toString('hex'))")Aa1"

if aws_ cognito-idp admin-get-user --user-pool-id "$POOL" --username "$EMAIL" >/dev/null 2>&1; then
  if [ "$RESET" != "--reset" ]; then
    echo "User $EMAIL already exists. Re-run with --reset to issue a new temporary password." >&2
    exit 1
  fi
  aws_ cognito-idp admin-set-user-password --user-pool-id "$POOL" --username "$EMAIL" --password "$TEMP" --no-permanent
else
  aws_ cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" --temporary-password "$TEMP" \
    --message-action SUPPRESS --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true >/dev/null
fi

echo "Demo login ready (stack $STACK)"
echo "  Email:              $EMAIL"
echo "  Temporary password: $TEMP"
echo "The app asks for a new password at first sign-in; this one then stops working."
