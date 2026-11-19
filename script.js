document.addEventListener("DOMContentLoaded", function () {
  const category = document.getElementById("category");
  const categoryDescription = document.getElementById("categoryDescription");
  const healthInput = document.getElementById("healthInput");
  const charCount = document.getElementById("charCount");
  const verifyButton = document.getElementById("verifyButton");
  const resultSection = document.getElementById("resultSection");
  const resultStatus = document.getElementById("resultStatus");
  const matchedClaim = document.getElementById("matchedClaim");
  const resultEvidence = document.getElementById("resultEvidence");
  const resultReason = document.getElementById("resultReason");
  const resultSources = document.getElementById("resultSources");
  const reviewPanel = document.getElementById("reviewPanel");
  const reviewOverall = document.getElementById("reviewOverall");

  const descriptions = {
    nutrition: "영양소, 비타민, 건강기능식품 등에 관한 정보를 입력해 주세요.",
    medicine: "질병의 증상, 치료법, 의약품 등에 관한 정보를 입력해 주세요.",
    lifestyle: "식습관, 운동, 수면 등 생활 건강정보를 입력해 주세요."
  };

  category.addEventListener("change", function () {
    categoryDescription.textContent =
      descriptions[category.value] ||
      "검증하고 싶은 정보의 분야를 선택해 주세요.";
  });

  healthInput.addEventListener("input", function () {
    charCount.textContent =
      Array.from(healthInput.value).length + " / 2000자";
  });

  function displaySources(sources) {
    resultSources.replaceChildren();

    if (!Array.isArray(sources) || sources.length === 0) {
      resultSources.textContent = "등록된 참고 출처가 없습니다.";
      return;
    }

    sources.forEach(function (source) {
      const row = document.createElement("div");
      row.className = "source-entry";

      if (source && typeof source === "object") {
        const label = [source.name, source.title]
          .filter(Boolean)
          .join(" - ");

        const title = document.createElement("div");
        title.textContent = label || "참고 자료";
        row.appendChild(title);

        if (
          typeof source.url === "string" &&
          /^https?:\/\//i.test(source.url)
        ) {
          const link = document.createElement("a");
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "공식 자료 열기";
          row.appendChild(link);
        }
      } else {
        row.textContent = String(source);
      }

      resultSources.appendChild(row);
    });
  }

  function displayReview(review) {
    reviewPanel.replaceChildren();

    const criteria = [
      ["accuracy", "정확성"],
      ["validity", "타당성"],
      ["timeliness", "최신성"],
      ["limitations", "한계 검토"]
    ];

    if (!review || typeof review !== "object") {
      reviewOverall.textContent = "추가 확인 필요";
      reviewPanel.textContent = "검토 정보가 등록되지 않았습니다.";
      return;
    }

    reviewOverall.textContent =
      review.overallStatus || "부분 검토 완료";

    criteria.forEach(function ([key, label]) {
      const info = review[key] || {};
      const status = info.status || "추가 확인 필요";

      const card = document.createElement("div");
      card.className = "review-item";

      const head = document.createElement("div");
      head.className = "review-item-heading";

      const title = document.createElement("strong");
      title.textContent = label;

      const badge = document.createElement("span");
      badge.className = "review-status";

      if (status === "확인 완료") {
        badge.classList.add("completed");
      } else if (status === "확인 불가") {
        badge.classList.add("unavailable");
      } else if (status === "부분 확인") {
        badge.classList.add("partial");
      } else {
        badge.classList.add("pending");
      }

      badge.textContent = status;
      head.append(title, badge);

      const detail = document.createElement("p");
      detail.textContent =
        info.detail || "검토 내용이 등록되지 않았습니다.";

      card.append(head, detail);

      if (key === "timeliness" && info.updatedDate) {
        const date = document.createElement("p");
        date.className = "review-date";
        date.textContent =
          "확인된 자료 수정일: " + info.updatedDate;
        card.appendChild(date);
      }

      reviewPanel.appendChild(card);
    });

    const method = document.createElement("p");
    method.className = "review-method";
    method.textContent =
      "검토일: " + (review.checkedAt || "미기록") +
      " · " +
      (review.method || "공개 자료 대조 방식으로 검토했습니다.");

    reviewPanel.appendChild(method);
  }

  verifyButton.addEventListener("click", async function () {
    const selectedCategory = category.value;
    const inputText = healthInput.value.trim();

    if (!selectedCategory) {
      alert("건강정보 분야를 선택해 주세요.");
      category.focus();
      return;
    }

    if (!inputText) {
      alert("건강정보를 입력해 주세요.");
      healthInput.focus();
      return;
    }

    verifyButton.disabled = true;
    verifyButton.textContent = "자료를 비교하는 중...";

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category: selectedCategory,
          text: inputText
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "요청에 실패했습니다."
        );
      }

      resultSection.hidden = false;

      resultStatus.textContent =
        data.status || "판정 정보가 없습니다.";

      matchedClaim.textContent = data.matchedClaim
        ? "비교한 등록 주장: " + data.matchedClaim
        : "일치하는 등록 자료를 찾지 못했습니다.";

      resultEvidence.textContent =
        data.evidence || "검증 근거가 없습니다.";

      resultReason.textContent = data.reason
        ? "판단 이유: " + data.reason
        : "";

      resultReason.hidden = !data.reason;

      displaySources(data.sources);
      displayReview(data.review);

      resultSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    } catch (error) {
      alert("서버 연결 오류: " + error.message);

    } finally {
      verifyButton.disabled = false;
      verifyButton.textContent = "건강정보 검증하기";
    }
  });
});