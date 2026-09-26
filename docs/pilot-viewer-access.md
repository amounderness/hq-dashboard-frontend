# Switchboard pilot viewer access

This is the owner checklist for inviting 5–10 named viewers to the private Leeds pilot. There is no public sign-up page. Keep the existing Cloudflare Access protection on **all Worker traffic**, including assets and previews. The first viewer role can read the published Leeds package, reports and exports; only the owner email configured on the server can open the release controls or call their API.

## Before inviting anyone

1. Ask the person through a contact route you already trust for the exact email address they will use and their name. A request from an unknown address alone is not proof of identity. Confirm it with the known person through an existing channel (for example, a call or a conversation you initiated).
2. Decide whether the person needs **Viewer** access to the current published Leeds pilot. Do not offer owner/release access to a tester. The current published package has one viewer scope; do not upload restricted party-fed or individual-level data until separate dataset permissions are built and tested.
3. Keep a private invite record outside the Git repository: name, exact email, who verified the identity, date invited, role `Viewer`, date access was tested, and date removed. Keep the completed feedback forms with that private record if they identify a person.

## Add one verified viewer

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Zero Trust → Access controls → Policies**, and locate the Allow policy attached to the existing Switchboard Access application. Use its current private site link from your own dashboard or invite record.
2. Add the verified address as an **exact Emails** entry in the policy's **Include** rule. Keep the owner's address and all other existing verified addresses. Save the policy. Check the linked application still protects **All traffic**.
3. Do not use **Everyone**, **Emails ending in**, or **Login Methods → One-time PIN** as the Allow policy's Include rule. Those would widen access beyond the named viewers. One-time PIN is the sign-in method, not the permission rule.
4. Send the private site link to that person through the trusted channel. Tell them to enter the same approved address and use the Cloudflare one-time code sent to that inbox. Codes expire after 10 minutes. No Cloudflare account is needed for this sign-in method.
5. Ask them to confirm that the site opens and that **Owner releases** is absent. If they cannot sign in, first check the exact spelling of their address in the policy and the inbox they used. Record successful access in the private invite record.

Do not send the whole email list to testers. Do not ask anyone to forward a one-time code. If a person wants access but is not yet known to you, leave the request pending until you verify their identity and decide that this pilot is appropriate for them. A request-access form is deliberately deferred; it would add a public entry point and a second approval workflow for a very small pilot.

## Remove a viewer

1. Remove that exact email from the Allow policy and save it. Do not remove the owner address.
2. In **Zero Trust → Team & Resources → Users**, select that viewer and choose **Action → Revoke** to terminate existing sessions. Removing the policy entry alone can leave an already-issued application token usable until it expires.
3. Confirm the removal in the private invite record and ask the person to sign out. If a test account is available, check it can no longer reach the site. A full revocation test is required before the pilot is considered complete.

## Pilot handoff and checks

Give each viewer the [pilot tasks and feedback document](Switchboard-pilot-tasks-and-feedback.docx) with the private site link. Ask them to complete the tasks independently first, then note any help they needed. Collect feedback privately and turn reproducible bugs into specific issues with page, ward, election view, device and steps. Prioritise security/access failures and misleading results before visual polish. Do not mark Stage 04 complete until at least one viewer sign-in, viewer-only permissions and revocation have been exercised.

Cloudflare references: [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/), [manage policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/policy-management/), [one-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [session revocation](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).
