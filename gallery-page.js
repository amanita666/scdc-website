const lightbox = document.querySelector('.lightbox');
const lightboxImage = lightbox?.querySelector('img');
const lightboxCaption = lightbox?.querySelector('p');

document.querySelectorAll('[data-gallery]').forEach(button => {
  button.addEventListener('click', () => {
    lightboxImage.src = button.dataset.gallery;
    lightboxImage.alt = button.dataset.caption;
    lightboxCaption.textContent = button.dataset.caption;
    lightbox.showModal();
  });
});

lightbox?.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
lightbox?.addEventListener('click', event => {
  if (event.target === lightbox) lightbox.close();
});
