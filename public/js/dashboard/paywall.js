// public/js/dashboard/paywall.js
// Full-screen paywall when subscription isn't active.
// Uses POST /api/subscription/start (free or paid).

const PAYWALL_PLANS = [
  {
    id: "free",
    name: "Starter Free",
    price: 0,
    priceLabel: "KES 0",
    duration: "30-day trial",
    desc: "Perfect for trying out the platform.",
    features: [
      "Up to 3 properties",
      "Basic portfolio overview",
      "Maintenance tracking",
      "Email support",
    ],
  },
  {
    id: "basic",
    name: "Basic",
    price: 2500,
    priceLabel: "KES 2,500 / mo",
    duration: "Monthly",
    desc: "For small landlords just getting started.",
    features: [
      "Up to 5 properties",
      "Basic analytics",
      "Maintenance tracking",
      "Email support",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 5000,
    priceLabel: "KES 5,000 / mo",
    duration: "Monthly",
    desc: "For growing agencies and property managers.",
    features: [
      "Up to 50 properties",
      "Advanced analytics",
      "Tenant portal",
      "Priority support",
      "Multiple users",
    ],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 7500,
    priceLabel: "KES 7,500 / mo",
    duration: "Monthly",
    desc: "For large portfolios and real-estate firms.",
    features: [
      "Unlimited properties",
      "Custom integrations",
      "Dedicated account manager",
      "24/7 support",
      "White-label options",
    ],
  },
];

function showPaywall(sub) {
  let overlay = document.getElementById("paywallOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "paywallOverlay";
    document.body.appendChild(overlay);
  }

  const reason =
    sub.status === "expired"
      ? "Your subscription has expired."
      : sub.status === "pending"
        ? "Complete your payment to activate your account."
        : sub.status === "none"
          ? "Choose a plan to get started."
          : "Your subscription is not active.";

  overlay.innerHTML = `
    <div class="paywall-shell">
      <div class="paywall-head">
        <div class="paywall-logo">Meridian <em>Properties</em></div>
        <h1 class="paywall-title">${esc(reason)}</h1>
        <p class="paywall-sub">Pick a package to continue. Pay securely via M-Pesa. Cancel anytime.</p>
      </div>

      <div class="paywall-grid">
        ${PAYWALL_PLANS.map(
          (p) => `
          <div class="paywall-card ${p.popular ? "popular" : ""}">
            ${p.popular ? '<div class="paywall-pop">Most Popular</div>' : ""}
            <div class="paywall-plan-name">${esc(p.name)}</div>
            <div class="paywall-price">${esc(p.priceLabel)}</div>
            <div class="paywall-desc">${esc(p.desc)}</div>
            <ul class="paywall-features">
              ${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}
            </ul>
            <button class="btn ${p.price === 0 ? "btn-outline" : "btn-primary"} paywall-btn"
                    onclick="pickSubscriptionPlan('${p.id}')">
              ${p.price === 0 ? "Start Free Trial" : "Pay with M-Pesa"}
            </button>
          </div>`,
        ).join("")}
      </div>

      <div class="paywall-foot">
        <button class="btn btn-outline" onclick="logout()">Log Out</button>
      </div>
    </div>
  `;

  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function hidePaywall() {
  const overlay = document.getElementById("paywallOverlay");
  if (overlay) {
    overlay.style.display = "none";
    overlay.innerHTML = "";
  }
  document.body.style.overflow = "";
}

async function pickSubscriptionPlan(planId) {
  const plan = PAYWALL_PLANS.find((p) => p.id === planId);
  if (!plan) return;

  // Free trial — no payment
  if (plan.price === 0) {
    if (
      !confirm("Start your 30-day free trial now?\n\nYou can upgrade anytime.")
    )
      return;
    try {
      const res = await api("/api/subscription/start", {
        method: "POST",
        body: JSON.stringify({ plan: "free" }),
      });
      toast(res.message || "Free trial activated!", "success");
      hidePaywall();
      loadDashboard();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  // Paid plan — ask for phone
  const phone = prompt(
    `Pay ${plan.priceLabel} for ${plan.name}\n\nEnter your M-Pesa phone number (e.g. 254712345678):`,
  );
  if (!phone) return;

  try {
    const res = await api("/api/subscription/start", {
      method: "POST",
      body: JSON.stringify({ plan: planId, phone: phone.trim() }),
    });
    toast("Check your phone for the M-Pesa prompt...", "info");

    // Poll for activation
    let seconds = 0;
    const poll = setInterval(async () => {
      seconds += 3;
      try {
        const status = await api("/api/subscription/status");
        if (status.isActive) {
          clearInterval(poll);
          toast("Payment confirmed. Welcome!", "success");
          hidePaywall();
          loadDashboard();
        } else if (seconds >= 90) {
          clearInterval(poll);
          toast(
            "Payment not confirmed yet. Please try again or contact support.",
            "error",
          );
        }
      } catch {}
    }, 3000);
  } catch (err) {
    toast(err.message, "error");
  }
}

function maybeShowRenewalBanner(sub) {
  const existing = document.getElementById("renewalBanner");
  if (existing) existing.remove();

  if (!sub.isActive || sub.daysLeft > 7) return;

  const banner = document.createElement("div");
  banner.id = "renewalBanner";
  banner.className = "renewal-banner";
  banner.innerHTML = `
    <span>Your ${sub.plan} plan expires in <strong>${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"}</strong>.</span>
    <button class="btn btn-primary btn-sm" onclick="showPaywall({ status: 'expiring' })">Renew Now</button>
  `;
  document.querySelector(".main")?.prepend(banner);
}
